import {
  BadRequestException,
  ForbiddenException,
  HttpException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { Page, User, Workspace } from '@docmost/db/types/entity.types';
import { PageRepo } from '@docmost/db/repos/page/page.repo';
import {
  PageVerificationRepo,
  PageVerificationWithRelations,
} from '@docmost/db/repos/page-verification/page-verification.repo';
import { SpaceMemberRepo } from '@docmost/db/repos/space/space-member.repo';
import { PagePermissionRepo } from '@docmost/db/repos/page/page-permission.repo';
import { PaginationOptions } from '@docmost/db/pagination/pagination-options';
import { PageAccessService } from '../page/page-access/page-access.service';
import { WsService } from '../../ws/ws.service';
import { QueueJob, QueueName } from '../../integrations/queue/constants';
import { IPageVerifiedNotificationJob } from '../../integrations/queue/constants/queue.interface';
import {
  AuditEvent,
  AuditEventType,
  AuditResource,
} from '../../common/events/audit-events';
import {
  AUDIT_SERVICE,
  IAuditService,
} from '../../integrations/audit/audit.service';
import { getPageTitle } from '../../common/helpers';
import { NotificationType } from '../notification/notification.constants';
import {
  computeExpiresAt,
  computeVerificationStatus,
  VerificationMode,
} from './page-verification.utils';
import {
  CreatePageVerificationDto,
  ListPageVerificationsDto,
  UpdatePageVerificationDto,
} from './dto/page-verification.dto';

const REMINDER_NOTIFICATION_TYPES = [
  NotificationType.PAGE_VERIFICATION_EXPIRING,
  NotificationType.PAGE_VERIFICATION_EXPIRED,
];

@Injectable()
export class PageVerificationService {
  private readonly logger = new Logger(PageVerificationService.name);

  constructor(
    private readonly pageRepo: PageRepo,
    private readonly pageVerificationRepo: PageVerificationRepo,
    private readonly spaceMemberRepo: SpaceMemberRepo,
    private readonly pagePermissionRepo: PagePermissionRepo,
    private readonly pageAccessService: PageAccessService,
    private readonly wsService: WsService,
    @InjectQueue(QueueName.NOTIFICATION_QUEUE)
    private readonly notificationQueue: Queue,
    @Inject(AUDIT_SERVICE) private readonly auditService: IAuditService,
  ) {}

  async getInfo(pageId: string, user: User, workspace: Workspace) {
    const page = await this.findPage(pageId, workspace);
    await this.pageAccessService.validateCanView(page, user);

    const verification = await this.pageVerificationRepo.findByPageId(page.id);
    const canManage = await this.canEditPage(page, user);

    if (!verification) {
      return {
        pageId: page.id,
        status: 'none',
        permissions: { canManage, canVerify: false },
      };
    }

    return this.toInfo(verification, {
      canManage,
      canVerify: verification.verifiers.some((v) => v.id === user.id),
    });
  }

  async create(
    dto: CreatePageVerificationDto,
    user: User,
    workspace: Workspace,
  ) {
    const page = await this.findPage(dto.pageId, workspace);
    await this.pageAccessService.validateCanEdit(page, user);

    if (await this.pageVerificationRepo.findByPageId(page.id)) {
      throw new BadRequestException('Page verification already exists');
    }

    const verifierIds = await this.validateVerifiers(dto.verifierIds, page);
    const now = new Date();
    const fixedExpiresAt = this.parseFixedDate(dto.mode, dto.fixedExpiresAt);

    // setting up counts as the first verification
    const verification = await this.pageVerificationRepo.insert({
      pageId: page.id,
      workspaceId: workspace.id,
      spaceId: page.spaceId,
      type: 'expiring',
      mode: dto.mode,
      periodAmount: dto.mode === 'period' ? dto.periodAmount : null,
      periodUnit: dto.mode === 'period' ? dto.periodUnit : null,
      verifiedAt: now,
      verifiedById: user.id,
      expiresAt: computeExpiresAt({
        mode: dto.mode,
        from: now,
        periodAmount: dto.periodAmount,
        periodUnit: dto.periodUnit,
        fixedExpiresAt,
      }),
      creatorId: user.id,
    });
    await this.pageVerificationRepo.replaceVerifiers(
      verification.id,
      verifierIds,
      user.id,
    );

    this.audit(AuditEvent.PAGE_VERIFICATION_CREATED, page, verification.id);
    this.emitUpdated(page);

    return this.getInfo(page.id, user, workspace);
  }

  async update(
    dto: UpdatePageVerificationDto,
    user: User,
    workspace: Workspace,
  ) {
    const page = await this.findPage(dto.pageId, workspace);
    await this.pageAccessService.validateCanEdit(page, user);
    const verification = await this.findVerification(page.id);

    const mode = (dto.mode ?? verification.mode) as VerificationMode;
    const periodAmount = dto.periodAmount ?? verification.periodAmount;
    const periodUnit = dto.periodUnit ?? verification.periodUnit;

    if (mode === 'period' && (!periodAmount || !periodUnit)) {
      throw new BadRequestException('A period is required');
    }

    const fixedExpiresAt =
      mode === 'fixed'
        ? dto.fixedExpiresAt
          ? this.parseFixedDate(mode, dto.fixedExpiresAt)
          : verification.mode === 'fixed'
            ? verification.expiresAt
            : this.parseFixedDate(mode, undefined)
        : null;

    // the interval restarts from the last verification
    const expiresAt = computeExpiresAt({
      mode,
      from: verification.verifiedAt ?? new Date(),
      periodAmount,
      periodUnit,
      fixedExpiresAt,
    });

    await this.pageVerificationRepo.update(verification.id, {
      mode,
      periodAmount: mode === 'period' ? periodAmount : null,
      periodUnit: mode === 'period' ? periodUnit : null,
      expiresAt,
    });

    if (dto.verifierIds) {
      const verifierIds = await this.validateVerifiers(dto.verifierIds, page);
      await this.pageVerificationRepo.replaceVerifiers(
        verification.id,
        verifierIds,
        user.id,
      );
    }

    if (
      new Date(expiresAt ?? 0).getTime() !==
      new Date(verification.expiresAt ?? 0).getTime()
    ) {
      await this.pageVerificationRepo.deleteReminderNotifications(
        verification.id,
        REMINDER_NOTIFICATION_TYPES,
      );
    }

    this.audit(AuditEvent.PAGE_VERIFICATION_UPDATED, page, verification.id);
    this.emitUpdated(page);

    return this.getInfo(page.id, user, workspace);
  }

  async remove(pageId: string, user: User, workspace: Workspace) {
    const page = await this.findPage(pageId, workspace);
    await this.pageAccessService.validateCanEdit(page, user);
    const verification = await this.findVerification(page.id);

    await this.pageVerificationRepo.delete(verification.id);

    this.audit(AuditEvent.PAGE_VERIFICATION_REMOVED, page, verification.id);
    this.emitUpdated(page);
  }

  async verify(pageId: string, user: User, workspace: Workspace) {
    const page = await this.findPage(pageId, workspace);
    await this.pageAccessService.validateCanView(page, user);
    const verification = await this.findVerification(page.id);

    if (!verification.verifiers.some((v) => v.id === user.id)) {
      throw new ForbiddenException('Only verifiers can verify this page');
    }

    const now = new Date();
    const mode = verification.mode as VerificationMode;
    if (
      mode === 'fixed' &&
      verification.expiresAt &&
      new Date(verification.expiresAt).getTime() <= now.getTime()
    ) {
      throw new BadRequestException(
        'The expiry date has passed. Set a new expiry date before verifying.',
      );
    }

    await this.pageVerificationRepo.update(verification.id, {
      verifiedAt: now,
      verifiedById: user.id,
      expiresAt: computeExpiresAt({
        mode,
        from: now,
        periodAmount: verification.periodAmount,
        periodUnit: verification.periodUnit,
        fixedExpiresAt: verification.expiresAt,
      }),
    });
    await this.pageVerificationRepo.deleteReminderNotifications(
      verification.id,
      REMINDER_NOTIFICATION_TYPES,
    );

    const otherVerifierIds = verification.verifiers
      .map((v) => v.id)
      .filter((id) => id !== user.id);
    if (otherVerifierIds.length > 0) {
      const job: IPageVerifiedNotificationJob = {
        pageId: page.id,
        spaceId: page.spaceId,
        workspaceId: workspace.id,
        actorId: user.id,
        verifierIds: otherVerifierIds,
      };
      await this.notificationQueue
        .add(QueueJob.PAGE_VERIFIED_NOTIFICATION, job)
        .catch((err) =>
          this.logger.warn(
            `Failed to queue page-verified notification: ${err.message}`,
          ),
        );
    }

    this.audit(AuditEvent.PAGE_VERIFIED, page, verification.id);
    this.emitUpdated(page);

    return this.getInfo(page.id, user, workspace);
  }

  async list(dto: ListPageVerificationsDto, user: User, workspace: Workspace) {
    const userSpaceIds = await this.spaceMemberRepo.getUserSpaceIds(user.id);
    const spaceIds = dto.spaceId
      ? userSpaceIds.filter((id) => id === dto.spaceId)
      : userSpaceIds;

    const result = await this.pageVerificationRepo.list({
      workspaceId: workspace.id,
      spaceIds,
      verifierId: dto.verifierId,
      query: dto.query?.trim() || undefined,
      pagination: {
        limit: dto.limit ?? 20,
        cursor: dto.cursor,
      } as PaginationOptions,
    });

    // drop verifications on restricted pages the user cannot see
    const accessible = new Set(
      await this.pagePermissionRepo.filterAccessiblePageIds({
        pageIds: result.items.map((item) => item.pageId),
        userId: user.id,
      }),
    );

    return {
      ...result,
      items: result.items
        .filter((item) => accessible.has(item.pageId))
        .map((item: any) => ({
          id: item.id,
          pageId: item.pageId,
          spaceId: item.spaceId,
          status: computeVerificationStatus(item),
          mode: item.mode,
          periodAmount: item.periodAmount,
          periodUnit: item.periodUnit,
          verifiedAt: item.verifiedAt,
          verifiedBy: item.verifiedBy,
          expiresAt: item.expiresAt,
          pageTitle: item.pageTitle,
          pageSlugId: item.pageSlugId,
          pageIcon: item.pageIcon,
          spaceName: item.spaceName,
          spaceSlug: item.spaceSlug,
          verifiers: item.verifiers,
        })),
    };
  }

  private toInfo(
    v: PageVerificationWithRelations,
    permissions: { canManage: boolean; canVerify: boolean },
  ) {
    return {
      id: v.id,
      pageId: v.pageId,
      type: v.type,
      mode: v.mode,
      periodAmount: v.periodAmount,
      periodUnit: v.periodUnit,
      status: computeVerificationStatus(v),
      verifiedAt: v.verifiedAt,
      verifiedBy: v.verifiedBy,
      expiresAt: v.expiresAt,
      verifiers: v.verifiers,
      permissions,
    };
  }

  private async findPage(pageId: string, workspace: Workspace): Promise<Page> {
    const page = await this.pageRepo.findById(pageId);
    if (!page || page.workspaceId !== workspace.id || page.deletedAt) {
      throw new NotFoundException('Page not found');
    }
    return page;
  }

  private async findVerification(pageId: string) {
    const verification = await this.pageVerificationRepo.findByPageId(pageId);
    if (!verification || verification.type !== 'expiring') {
      throw new NotFoundException('Page verification not found');
    }
    return verification;
  }

  private async canEditPage(page: Page, user: User): Promise<boolean> {
    try {
      await this.pageAccessService.validateCanEdit(page, user);
      return true;
    } catch (err) {
      if (err instanceof HttpException) return false;
      throw err;
    }
  }

  // Verifiers must be able to read the page they verify.
  private async validateVerifiers(
    verifierIds: string[],
    page: Page,
  ): Promise<string[]> {
    const ids = [...new Set(verifierIds)];
    const inSpace = await this.spaceMemberRepo.getUserIdsWithSpaceAccess(
      ids,
      page.spaceId,
    );
    const accessible = new Set(
      await this.pagePermissionRepo.getUserIdsWithPageAccess(page.id, [
        ...inSpace,
      ]),
    );
    if (ids.some((id) => !accessible.has(id))) {
      throw new BadRequestException(
        'All verifiers must have access to this page',
      );
    }
    return ids;
  }

  private parseFixedDate(
    mode: VerificationMode,
    value: string | undefined,
  ): Date | null {
    if (mode !== 'fixed') return null;
    const date = value ? new Date(value) : null;
    if (!date || Number.isNaN(date.getTime())) {
      throw new BadRequestException('An expiry date is required');
    }
    if (date.getTime() <= Date.now()) {
      throw new BadRequestException('The expiry date must be in the future');
    }
    return date;
  }

  private audit(event: AuditEventType, page: Page, verificationId: string) {
    this.auditService.log({
      event,
      resourceType: AuditResource.PAGE,
      resourceId: page.id,
      spaceId: page.spaceId,
      metadata: { title: getPageTitle(page.title), verificationId },
    });
  }

  // the space room broadcast already skips users without access to restricted pages
  private emitUpdated(page: Page) {
    this.wsService
      .emitCommentEvent(page.spaceId, page.id, {
        operation: 'verificationUpdated',
        pageId: page.id,
      })
      .catch((err) =>
        this.logger.warn(`Failed to emit verificationUpdated: ${err.message}`),
      );
  }
}
