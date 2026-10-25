import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { InjectKysely } from 'nestjs-kysely';
import { sql } from 'kysely';
import { Server, Socket } from 'socket.io';
import { KyselyDB } from '@docmost/db/types/kysely.types';
import { PagePermissionRepo } from '@docmost/db/repos/page/page-permission.repo';
import { SpaceMemberRepo } from '@docmost/db/repos/space/space-member.repo';
import { BasePropertyRepo } from '@docmost/db/repos/base/base-property.repo';
import { BASE_INBOUND_EVENTS, getBaseRoomName } from '../../../ws/ws.utils';
import { BASE_SOCKET_EVENTS, BaseEventPayload } from '../base.events';

const AUTH_WAIT_MS = 100;
const AUTH_WAIT_ATTEMPTS = 50;

type BasePage = { id: string; spaceId: string; workspaceId: string };

// Realtime for bases: clients subscribe to a per-base room after an access
// check; the service events of the bases module are relayed into that room.
@Injectable()
export class BaseWsService implements OnModuleInit {
  private readonly logger = new Logger(BaseWsService.name);
  private server: Server | null = null;

  constructor(
    @InjectKysely() private readonly db: KyselyDB,
    private readonly eventEmitter: EventEmitter2,
    private readonly pagePermissionRepo: PagePermissionRepo,
    private readonly spaceMemberRepo: SpaceMemberRepo,
    private readonly propertyRepo: BasePropertyRepo,
  ) {}

  onModuleInit() {
    for (const [eventName, socketName] of Object.entries(BASE_SOCKET_EVENTS)) {
      this.eventEmitter.on(eventName, (payload: BaseEventPayload) =>
        this.broadcast(socketName, payload),
      );
    }
  }

  setServer(server: Server): void {
    this.server = server;
  }

  isBaseEvent(data: any): boolean {
    return BASE_INBOUND_EVENTS.has(data?.operation);
  }

  async handleInbound(client: Socket, data: any): Promise<void> {
    const pageId = data?.pageId;
    if (typeof pageId !== 'string') return;
    if (!(await this.waitForAuth(client))) return;

    if (data.operation === 'base:subscribe') {
      await this.subscribe(client, pageId);
    } else if (data.operation === 'base:unsubscribe') {
      client.leave(getBaseRoomName(pageId));
    }
    // presence is not used by the client
  }

  // The client sends base:subscribe right after it connects, which can be
  // before the gateway has finished authorizing the connection.
  private async waitForAuth(client: Socket): Promise<boolean> {
    for (let i = 0; i < AUTH_WAIT_ATTEMPTS; i++) {
      if (client.data?.userId) return true;
      if (client.disconnected) return false;
      await new Promise((resolve) => setTimeout(resolve, AUTH_WAIT_MS));
    }
    return !!client.data?.userId;
  }

  async handleDisconnect(_client: Socket): Promise<void> {
    // socket.io removes the socket from its rooms
  }

  private async subscribe(client: Socket, pageId: string) {
    try {
      const page = await this.findBasePage(pageId);
      if (!page || page.workspaceId !== client.data.workspaceId) return;
      if (!(await this.canView(client.data.userId, page))) return;

      await client.join(getBaseRoomName(page.id));
      const schemaVersion = await this.propertyRepo.getSchemaVersion(page.id);
      client.emit('message', {
        operation: 'base:subscribed',
        pageId,
        schemaVersion,
      });
    } catch (err) {
      this.logger.warn(`Base subscribe failed: ${(err as Error).message}`);
    }
  }

  private async findBasePage(pageId: string): Promise<BasePage | undefined> {
    return this.db
      .selectFrom('pages')
      .select(['id', 'spaceId', 'workspaceId'])
      .where('id', '=', pageId)
      .where('isBase', '=', true)
      .where('deletedAt', 'is', null)
      .executeTakeFirst();
  }

  private async canView(userId: string, page: BasePage): Promise<boolean> {
    const inSpace = await this.spaceMemberRepo.getUserIdsWithSpaceAccess(
      [userId],
      page.spaceId,
    );
    if (!inSpace.has(userId)) return false;
    const allowed = await this.pagePermissionRepo.getUserIdsWithPageAccess(
      page.id,
      [userId],
    );
    return allowed.includes(userId);
  }

  private broadcast(socketName: string, payload: BaseEventPayload) {
    if (!this.server || !payload?.pageId) return;
    const { workspaceId: _w, actorId: _a, ...rest } = payload;
    this.server
      .to(getBaseRoomName(payload.pageId))
      .emit('message', { operation: socketName, ...rest });
  }

  // Users who lost access to a space leave the rooms of its bases.
  async removeUsersFromSpaceBases(
    userIds: string[],
    spaceId: string,
  ): Promise<void> {
    if (!this.server || userIds.length === 0) return;
    const sockets = await this.server
      .in(userIds.map((id) => `user-${id}`))
      .fetchSockets();
    const roomsByPage = new Map<string, typeof sockets>();
    for (const s of sockets) {
      for (const room of s.rooms) {
        if (!room.startsWith('base-')) continue;
        const list = roomsByPage.get(room.slice(5)) ?? [];
        list.push(s);
        roomsByPage.set(room.slice(5), list);
      }
    }
    if (roomsByPage.size === 0) return;
    const inSpace = await this.db
      .selectFrom('pages')
      .select('id')
      .where('id', 'in', [...roomsByPage.keys()])
      .where('spaceId', '=', spaceId)
      .execute();
    for (const { id } of inSpace) {
      for (const s of roomsByPage.get(id) ?? []) s.leave(getBaseRoomName(id));
    }
  }

  // After a move or a permission change: drop subscribers that can no longer
  // open the base. Bases below the given pages are included.
  async removeSubscribersWithoutAccess(pageIds: string[]): Promise<void> {
    if (!this.server || pageIds.length === 0) return;
    const rows = await sql<{ id: string }>`
      with recursive tree as (
        select id from pages where id = any(${pageIds}::uuid[])
        union all
        select p.id from pages p join tree t on p.parent_page_id = t.id
      )
      select pages.id from pages join tree on tree.id = pages.id
      where pages.is_base = true and pages.deleted_at is null
    `.execute(this.db);

    for (const { id } of rows.rows) {
      const page = await this.findBasePage(id);
      if (!page) continue;
      const sockets = await this.server.in(getBaseRoomName(id)).fetchSockets();
      const checked = new Map<string, boolean>();
      for (const s of sockets) {
        const userId = s.data?.userId as string | undefined;
        if (!userId) continue;
        if (!checked.has(userId)) {
          checked.set(userId, await this.canView(userId, page));
        }
        if (!checked.get(userId)) s.leave(getBaseRoomName(id));
      }
    }
  }
}
