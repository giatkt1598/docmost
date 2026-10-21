import {
  BadRequestException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { ApiKey, User, Workspace } from '@docmost/db/types/entity.types';
import { ApiKeyRepo } from '@docmost/db/repos/api-key/api-key.repo';
import { UserRepo } from '@docmost/db/repos/user/user.repo';
import { WorkspaceRepo } from '@docmost/db/repos/workspace/workspace.repo';
import { PaginationOptions } from '@docmost/db/pagination/pagination-options';
import { TokenService } from '../auth/services/token.service';
import { JwtApiKeyPayload } from '../auth/dto/jwt-payload';
import { isUserDisabled } from '../../common/helpers';
import { UserRole } from '../../common/helpers/types/permission';
import { AuditEvent, AuditResource } from '../../common/events/audit-events';
import {
  AUDIT_SERVICE,
  IAuditService,
} from '../../integrations/audit/audit.service';
import { CreateApiKeyDto } from './dto/api-key.dto';

const MAX_LIFETIME_MS = 366 * 24 * 60 * 60 * 1000;
const LAST_USED_RESOLUTION_MS = 60 * 1000;

export function isWorkspaceAdmin(user: Pick<User, 'role'>): boolean {
  return user.role === UserRole.ADMIN || user.role === UserRole.OWNER;
}

export function apiRestrictedToAdmins(workspace: Pick<Workspace, 'settings'>) {
  const settings = workspace.settings as {
    api?: { restrictToAdmins?: boolean };
  } | null;
  return settings?.api?.restrictToAdmins === true;
}

// Personal API keys: a signed token that acts as its creator. The token is
// shown once; revoking or expiring the key row disables it.
@Injectable()
export class ApiKeyService {
  // last time lastUsedAt was written per key, to avoid a write per request
  private readonly lastTouched = new Map<string, number>();

  constructor(
    private readonly apiKeyRepo: ApiKeyRepo,
    private readonly userRepo: UserRepo,
    private readonly workspaceRepo: WorkspaceRepo,
    private readonly tokenService: TokenService,
    @Inject(AUDIT_SERVICE) private readonly auditService: IAuditService,
  ) {}

  async list(
    user: User,
    workspace: Workspace,
    adminView: boolean,
    pagination: PaginationOptions,
  ) {
    if (adminView && !isWorkspaceAdmin(user)) throw new ForbiddenException();
    return this.apiKeyRepo.list(
      {
        workspaceId: workspace.id,
        creatorId: adminView ? undefined : user.id,
      },
      pagination,
    );
  }

  async create(user: User, workspace: Workspace, dto: CreateApiKeyDto) {
    if (apiRestrictedToAdmins(workspace) && !isWorkspaceAdmin(user)) {
      throw new ForbiddenException(
        'API key creation is restricted to workspace admins',
      );
    }

    let expiresAt: Date | null = null;
    if (dto.expiresAt) {
      expiresAt = new Date(dto.expiresAt);
      const lifetime = expiresAt.getTime() - Date.now();
      if (lifetime <= 0) {
        throw new BadRequestException('Expiry date must be in the future');
      }
      if (lifetime > MAX_LIFETIME_MS) {
        throw new BadRequestException(
          'Expiry date can be at most one year ahead',
        );
      }
    }

    const apiKey = await this.apiKeyRepo.insert({
      name: dto.name,
      creatorId: user.id,
      workspaceId: workspace.id,
      expiresAt,
    });
    const token = await this.tokenService.generateApiToken({
      apiKeyId: apiKey.id,
      user,
      workspaceId: workspace.id,
      ...(expiresAt && {
        expiresIn: Math.floor((expiresAt.getTime() - Date.now()) / 1000),
      }),
    });

    this.audit(AuditEvent.API_KEY_CREATED, apiKey, { name: apiKey.name });
    return { ...apiKey, token };
  }

  async rename(
    user: User,
    workspace: Workspace,
    apiKeyId: string,
    name: string,
  ) {
    const apiKey = await this.findManageable(user, workspace, apiKeyId);
    const updated = await this.apiKeyRepo.update(apiKey.id, workspace.id, {
      name,
    });
    this.audit(AuditEvent.API_KEY_UPDATED, apiKey, {
      before: apiKey.name,
      after: name,
    });
    return updated;
  }

  async revoke(user: User, workspace: Workspace, apiKeyId: string) {
    const apiKey = await this.findManageable(user, workspace, apiKeyId);
    await this.apiKeyRepo.softDelete(apiKey.id, workspace.id);
    this.lastTouched.delete(apiKey.id);
    this.audit(AuditEvent.API_KEY_DELETED, apiKey, { name: apiKey.name });
  }

  // Called by JwtStrategy for every request made with an API key.
  async validateApiKey(
    payload: JwtApiKeyPayload,
  ): Promise<{ user: User; workspace: Workspace }> {
    const apiKey = await this.apiKeyRepo.findById(
      payload.apiKeyId,
      payload.workspaceId,
    );
    if (
      !apiKey ||
      apiKey.creatorId !== payload.sub ||
      (apiKey.expiresAt && new Date(apiKey.expiresAt).getTime() <= Date.now())
    ) {
      throw new UnauthorizedException('Invalid API key');
    }

    const [user, workspace] = await Promise.all([
      this.userRepo.findById(payload.sub, payload.workspaceId),
      this.workspaceRepo.findById(payload.workspaceId),
    ]);
    if (!user || !workspace || isUserDisabled(user)) {
      throw new UnauthorizedException('Invalid API key');
    }
    if (apiRestrictedToAdmins(workspace) && !isWorkspaceAdmin(user)) {
      throw new UnauthorizedException(
        'API access is restricted to workspace admins',
      );
    }

    this.touch(apiKey.id);
    return { user, workspace };
  }

  private touch(apiKeyId: string) {
    const now = Date.now();
    if (now - (this.lastTouched.get(apiKeyId) ?? 0) < LAST_USED_RESOLUTION_MS) {
      return;
    }
    this.lastTouched.set(apiKeyId, now);
    this.apiKeyRepo.touchLastUsed(apiKeyId).catch(() => undefined);
  }

  // Owners manage their own keys; admins manage every key of the workspace.
  private async findManageable(
    user: User,
    workspace: Workspace,
    apiKeyId: string,
  ): Promise<ApiKey> {
    const apiKey = await this.apiKeyRepo.findById(apiKeyId, workspace.id);
    if (!apiKey) throw new NotFoundException('API key not found');
    if (apiKey.creatorId !== user.id && !isWorkspaceAdmin(user)) {
      throw new NotFoundException('API key not found');
    }
    return apiKey;
  }

  private audit(
    event:
      | typeof AuditEvent.API_KEY_CREATED
      | typeof AuditEvent.API_KEY_UPDATED
      | typeof AuditEvent.API_KEY_DELETED,
    apiKey: ApiKey,
    metadata: Record<string, unknown>,
  ) {
    this.auditService.log({
      event,
      resourceType: AuditResource.API_KEY,
      resourceId: apiKey.id,
      metadata: { creatorId: apiKey.creatorId, ...metadata },
    });
  }
}
