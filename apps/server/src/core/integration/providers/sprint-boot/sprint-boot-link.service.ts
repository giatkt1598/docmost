import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { RedisService } from '@nestjs-labs/nestjs-ioredis';
import type { Redis } from 'ioredis';
import * as crypto from 'crypto';
import { User, Workspace } from '@docmost/db/types/entity.types';
import { UserRepo } from '@docmost/db/repos/user/user.repo';
import { WorkspaceRepo } from '@docmost/db/repos/workspace/workspace.repo';
import { SpaceRepo } from '@docmost/db/repos/space/space.repo';
import { ApiKeyRepo } from '@docmost/db/repos/api-key/api-key.repo';
import { EnvironmentService } from '../../../../integrations/environment/environment.service';
import { ApiKeyService } from '../../../api-key/api-key.service';
import { SpaceService } from '../../../space/services/space.service';
import { SpaceMemberService } from '../../../space/services/space-member.service';
import WorkspaceAbilityFactory from '../../../casl/abilities/workspace-ability.factory';
import {
  WorkspaceCaslAction,
  WorkspaceCaslSubject,
} from '../../../casl/interfaces/workspace-ability.type';
import { IntegrationConfigService } from '../../integration-config.service';
import { IntegrationService } from '../../integration.service';
import { IntegrationRepo } from '../../repos/integration.repo';
import { normalizeBaseUrl } from '../../utils/integration.utils';
import { providerApiFetch } from '../../utils/provider-fetch';
import { SPRINT_BOOT_TYPE } from './sprint-boot.provider';

const STATE_PREFIX = 'sprint-boot-link:';
const STATE_TTL_SECONDS = 15 * 60;
const API_KEY_NAME = 'Sprint Boot';
// integrations.settings key of the API key Sprint Boot holds; lowercase, so the camel-case plugin leaves it alone.
export const LINK_KEY_SETTING = 'keyid';

type LinkState = { workspaceId: string; userId: string; sprintBootUrl: string };

/**
 * Links Docmost and Sprint Boot in one go, from either side. The side that starts sends the browser to the other's
 * authorize page with a one-time state; the authorizing side hands its credentials to the starting side's server,
 * which answers with its own. Docmost gives Sprint Boot an API key of the admin; Sprint Boot gives Docmost the bridge
 * secret its integration calls with.
 */
@Injectable()
export class SprintBootLinkService {
  private readonly redis: Redis;

  constructor(
    redisService: RedisService,
    private readonly environmentService: EnvironmentService,
    private readonly apiKeyService: ApiKeyService,
    private readonly spaceService: SpaceService,
    private readonly spaceMemberService: SpaceMemberService,
    private readonly configService: IntegrationConfigService,
    private readonly integrationService: IntegrationService,
    private readonly integrationRepo: IntegrationRepo,
    private readonly userRepo: UserRepo,
    private readonly workspaceRepo: WorkspaceRepo,
    private readonly spaceRepo: SpaceRepo,
    private readonly apiKeyRepo: ApiKeyRepo,
    private readonly workspaceAbility: WorkspaceAbilityFactory,
  ) {
    this.redis = redisService.getOrThrow();
  }

  assertAdmin(user: User, workspace: Workspace): void {
    const ability = this.workspaceAbility.createForUser(user, workspace);
    if (ability.cannot(WorkspaceCaslAction.Manage, WorkspaceCaslSubject.Settings)) {
      throw new ForbiddenException();
    }
  }

  private get appUrl(): string {
    return this.environmentService.getAppUrl().replace(/\/+$/, '');
  }

  private static sprintBootUrl(value: string): string {
    const url = normalizeBaseUrl(value?.trim() ?? '')?.replace(/\/api\/v1\/docs-bridge$/i, '');
    if (!url) throw new BadRequestException('Enter the Sprint Boot address, such as https://sprint-boot.example.com');
    return url;
  }

  // Started here: Sprint Boot's authorize page picks the spaces and calls completeFromSprintBoot.
  async start(user: User, workspace: Workspace, sprintBootUrl: string) {
    this.assertAdmin(user, workspace);
    const url = SprintBootLinkService.sprintBootUrl(sprintBootUrl);
    const state = crypto.randomBytes(24).toString('hex');
    const value: LinkState = { workspaceId: workspace.id, userId: user.id, sprintBootUrl: url };
    await this.redis.set(STATE_PREFIX + state, JSON.stringify(value), 'EX', STATE_TTL_SECONDS);
    const query = new URLSearchParams({ docmostUrl: this.appUrl, state });
    return { authorizeUrl: `${url}/integrations/docmost/authorize?${query}` };
  }

  private async peek(state: string): Promise<LinkState> {
    const raw = typeof state === 'string' && state ? await this.redis.get(STATE_PREFIX + state) : null;
    if (!raw) throw new NotFoundException('This link request has expired');
    return JSON.parse(raw) as LinkState;
  }

  // The spaces Sprint Boot's authorize page offers: those of the admin who started the link.
  async linkRequest(state: string) {
    const link = await this.peek(state);
    const spaces = await this.spaceMemberService.getUserSpaces(link.userId, { limit: 100 } as any);
    return {
      spaces: spaces.items.map((space) => ({ id: space.id, name: space.name, slug: space.slug })),
    };
  }

  // Sprint Boot authorized a link started here: install its integration and hand it an API key.
  async completeFromSprintBoot(state: string, sprintBootUrl: string, bridgeSecret: string) {
    const link = await this.peek(state);
    await this.redis.del(STATE_PREFIX + state);
    if (SprintBootLinkService.sprintBootUrl(sprintBootUrl) !== link.sprintBootUrl || !bridgeSecret) {
      throw new BadRequestException('This link request was for another Sprint Boot');
    }

    const [user, workspace] = await Promise.all([
      this.userRepo.findById(link.userId, link.workspaceId),
      this.workspaceRepo.findById(link.workspaceId),
    ]);
    if (!user || !workspace) throw new NotFoundException('This link request has expired');

    await this.install(user, workspace, link.sprintBootUrl, bridgeSecret);
    const apiKey = await this.apiKeyService.create(user, workspace, { name: API_KEY_NAME });
    await this.rememberKey(workspace.id, apiKey.id);
    return { apiKey: apiKey.token, docmostUrl: this.appUrl };
  }

  // Started in Sprint Boot: its spaces, for this authorize page, through its public side of the link.
  async preview(user: User, workspace: Workspace, sprintBootUrl: string, state: string) {
    this.assertAdmin(user, workspace);
    const url = SprintBootLinkService.sprintBootUrl(sprintBootUrl);
    const data = await this.post(url, 'request', { state });
    return { sprintBootUrl: url, spaces: (data.spaces ?? []) as { key: string; name: string }[] };
  }

  // Authorized here for a link Sprint Boot started.
  async authorize(
    user: User,
    workspace: Workspace,
    input: {
      sprintBootUrl: string;
      state: string;
      spaceKey?: string;
      docmostSpaceId?: string;
      newSpaceName?: string;
    },
  ) {
    this.assertAdmin(user, workspace);
    const url = SprintBootLinkService.sprintBootUrl(input.sprintBootUrl);

    let docmostSpaceId = input.docmostSpaceId || undefined;
    if (input.newSpaceName?.trim()) {
      const name = input.newSpaceName.trim();
      const space = await this.spaceService.createSpace(user, workspace.id, {
        name,
        slug: await this.freeSlug(name, workspace.id),
      } as any);
      docmostSpaceId = space.id;
    }

    const apiKey = await this.apiKeyService.create(user, workspace, { name: API_KEY_NAME });
    const answer = await this.post(url, 'complete', {
      state: input.state,
      docmostUrl: this.appUrl,
      apiKey: apiKey.token,
      spaceKey: input.spaceKey && docmostSpaceId ? input.spaceKey : undefined,
      docmostSpaceId: input.spaceKey ? docmostSpaceId : undefined,
    });

    await this.install(user, workspace, url, answer.bridgeSecret);
    await this.rememberKey(workspace.id, apiKey.id);
    return { returnUrl: answer.returnUrl ?? `${url}/admin/integrations` };
  }

  // The integration keeps the id of the key Sprint Boot holds, so uninstalling revokes it; a new link revokes the old one.
  private async rememberKey(workspaceId: string, apiKeyId: string) {
    const integration = await this.integrationRepo.findByWorkspaceAndType(workspaceId, SPRINT_BOOT_TYPE);
    if (!integration) return;
    const settings = (integration.settings as Record<string, any>) ?? {};
    const previous = settings[LINK_KEY_SETTING];
    if (previous && previous !== apiKeyId) {
      await this.apiKeyRepo.softDelete(previous, workspaceId).catch(() => undefined);
    }
    await this.integrationRepo.update(integration.id, { settings: { ...settings, [LINK_KEY_SETTING]: apiKeyId } } as any);
  }

  // Sprint Boot uninstalled its side, calling with the key it held: uninstall here without telling it back.
  async unlinkedBySprintBoot(user: User, workspace: Workspace) {
    this.assertAdmin(user, workspace);
    const integration = await this.integrationRepo.findByWorkspaceAndType(workspace.id, SPRINT_BOOT_TYPE);
    if (!integration) return { uninstalled: false };
    await this.revokeKey(workspace.id, (integration.settings as Record<string, any>) ?? {});
    await this.integrationService.uninstall(integration.id, workspace.id, { notifyProvider: false });
    return { uninstalled: true };
  }

  async revokeKey(workspaceId: string, settings: Record<string, any>) {
    const keyId = settings?.[LINK_KEY_SETTING];
    if (keyId) {
      await this.apiKeyRepo.softDelete(keyId, workspaceId).catch(() => undefined);
    }
  }

  // Saves the Sprint Boot address and secret, which checks them with Sprint Boot, and installs once.
  private async install(user: User, workspace: Workspace, sprintBootUrl: string, bridgeSecret: string) {
    await this.configService.save(
      { type: SPRINT_BOOT_TYPE, baseUrl: sprintBootUrl, clientSecret: bridgeSecret },
      workspace.id,
      user.id,
    );
    if (!(await this.integrationRepo.findByWorkspaceAndType(workspace.id, SPRINT_BOOT_TYPE))) {
      await this.integrationService.installWithApiToken(SPRINT_BOOT_TYPE, workspace.id, user.id);
    }
  }

  private async freeSlug(name: string, workspaceId: string): Promise<string> {
    const base =
      name
        .normalize('NFD')
        .replace(/[̀-ͯ]/g, '')
        .replace(/đ/gi, 'd')
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '')
        .slice(0, 40) || 'space';
    for (let attempt = 0; attempt < 20; attempt++) {
      const slug = attempt === 0 ? base : `${base}-${attempt + 1}`;
      if (!(await this.spaceRepo.slugExists(slug, workspaceId))) return slug;
    }
    return `${base}-${crypto.randomBytes(3).toString('hex')}`;
  }

  private async post(sprintBootUrl: string, path: string, body: unknown): Promise<any> {
    try {
      const response = await providerApiFetch('Sprint Boot', `${sprintBootUrl}/api/v1/docs-link/${path}`, {
        method: 'POST',
        headers: {
          Accept: 'application/json',
          'Content-Type': 'application/json',
          'User-Agent': 'Docmost',
        },
        body: JSON.stringify(body),
      });
      return response.json();
    } catch (err) {
      throw new BadRequestException(
        `Sprint Boot refused the link: ${(err as Error).message}. Start again from Sprint Boot's integrations page.`,
      );
    }
  }
}
