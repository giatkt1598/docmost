import {
  BadRequestException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Template, User, Workspace } from '@docmost/db/types/entity.types';
import { TemplateRepo } from '@docmost/db/repos/template/template.repo';
import { PageRepo } from '@docmost/db/repos/page/page.repo';
import { SpaceMemberRepo } from '@docmost/db/repos/space/space-member.repo';
import { PaginationOptions } from '@docmost/db/pagination/pagination-options';
import SpaceAbilityFactory from '../casl/abilities/space-ability.factory';
import {
  SpaceCaslAction,
  SpaceCaslSubject,
} from '../casl/interfaces/space-ability.type';
import { PageAccessService } from '../page/page-access/page-access.service';
import { PageService } from '../page/services/page.service';
import { UserRole } from '../../common/helpers/types/permission';
import { getPageTitle } from '../../common/helpers';
import { jsonToNode, jsonToText } from '../../collaboration/collaboration.util';
import { AuditEvent, AuditResource } from '../../common/events/audit-events';
import {
  AUDIT_SERVICE,
  IAuditService,
} from '../../integrations/audit/audit.service';
import {
  CreateTemplateDto,
  ListTemplatesDto,
  UpdateTemplateDto,
  UseTemplateDto,
} from './dto/template.dto';

@Injectable()
export class TemplateService {
  constructor(
    private readonly templateRepo: TemplateRepo,
    private readonly pageRepo: PageRepo,
    private readonly spaceMemberRepo: SpaceMemberRepo,
    private readonly spaceAbility: SpaceAbilityFactory,
    private readonly pageAccessService: PageAccessService,
    private readonly pageService: PageService,
    @Inject(AUDIT_SERVICE) private readonly auditService: IAuditService,
  ) {}

  async list(dto: ListTemplatesDto, user: User, workspace: Workspace) {
    const spaceIds = await this.spaceMemberRepo.getUserSpaceIds(user.id);
    const result = await this.templateRepo.findTemplates(
      workspace.id,
      spaceIds,
      {
        limit: dto.limit ?? 24,
        cursor: dto.cursor,
        query: dto.query?.trim() || undefined,
      } as PaginationOptions,
      { spaceId: dto.spaceId },
    );

    const items = await Promise.all(
      result.items.map(async (template) => ({
        ...template,
        permissions: { canManage: await this.canManage(template, user) },
      })),
    );

    return { ...result, items };
  }

  async getInfo(templateId: string, user: User, workspace: Workspace) {
    const template = await this.findViewable(templateId, user, workspace, {
      includeContent: true,
    });
    return {
      ...template,
      permissions: { canManage: await this.canManage(template, user) },
    };
  }

  async create(dto: CreateTemplateDto, user: User, workspace: Workspace) {
    const spaceId = dto.spaceId ?? null;
    await this.assertCanCreateIn(spaceId, user);

    let { title, icon, content } = dto;
    if (dto.sourcePageId) {
      const page = await this.pageRepo.findById(dto.sourcePageId, {
        includeContent: true,
      });
      if (!page || page.workspaceId !== workspace.id || page.deletedAt) {
        throw new NotFoundException('Page not found');
      }
      await this.pageAccessService.validateCanView(page, user);
      title = title ?? page.title;
      icon = icon ?? page.icon;
      content = content ?? (page.content as Record<string, any>);
    }

    const { id } = await this.templateRepo.insertTemplate({
      title: title ?? null,
      description: dto.description ?? null,
      icon: icon ?? null,
      spaceId,
      workspaceId: workspace.id,
      creatorId: user.id,
      lastUpdatedById: user.id,
      ...this.contentFields(content),
    });

    this.auditService.log({
      event: AuditEvent.TEMPLATE_CREATED,
      resourceType: AuditResource.TEMPLATE,
      resourceId: id,
      spaceId: spaceId ?? undefined,
      metadata: {
        title: getPageTitle(title),
        ...(dto.sourcePageId && { sourcePageId: dto.sourcePageId }),
      },
    });

    return this.getInfo(id, user, workspace);
  }

  async update(dto: UpdateTemplateDto, user: User, workspace: Workspace) {
    const template = await this.findViewable(dto.templateId, user, workspace);
    await this.assertCanManage(template, user);

    const scopeChanged =
      dto.spaceId !== undefined && (dto.spaceId ?? null) !== template.spaceId;
    if (scopeChanged) {
      await this.assertCanCreateIn(dto.spaceId ?? null, user);
    }

    await this.templateRepo.updateTemplate(
      {
        ...(dto.title !== undefined && { title: dto.title }),
        ...(dto.description !== undefined && { description: dto.description }),
        ...(dto.icon !== undefined && { icon: dto.icon }),
        ...(scopeChanged && { spaceId: dto.spaceId ?? null }),
        ...(dto.content !== undefined && this.contentFields(dto.content)),
        lastUpdatedById: user.id,
      },
      template.id,
      workspace.id,
    );

    return this.getInfo(template.id, user, workspace);
  }

  async remove(templateId: string, user: User, workspace: Workspace) {
    const template = await this.findViewable(templateId, user, workspace);
    await this.assertCanManage(template, user);

    await this.templateRepo.deleteTemplate(template.id, workspace.id);

    this.auditService.log({
      event: AuditEvent.TEMPLATE_DELETED,
      resourceType: AuditResource.TEMPLATE,
      resourceId: template.id,
      spaceId: template.spaceId ?? undefined,
      metadata: { title: getPageTitle(template.title) },
    });
  }

  // Mirrors the permission checks of pages/create for the destination.
  async use(dto: UseTemplateDto, user: User, workspace: Workspace) {
    const template = await this.findViewable(dto.templateId, user, workspace, {
      includeContent: true,
    });

    if (dto.parentPageId) {
      const parentPage = await this.pageRepo.findById(dto.parentPageId);
      if (
        !parentPage ||
        parentPage.deletedAt ||
        parentPage.spaceId !== dto.spaceId
      ) {
        throw new NotFoundException('Parent page not found');
      }
      await this.pageAccessService.validateCanEdit(parentPage, user);
    } else {
      await this.assertSpaceAction(user, dto.spaceId, SpaceCaslAction.Create);
    }

    const page = await this.pageService.create(user.id, workspace.id, {
      title: template.title ?? undefined,
      icon: template.icon ?? undefined,
      spaceId: dto.spaceId,
      parentPageId: dto.parentPageId,
      ...(template.content && {
        content: template.content as object,
        format: 'json',
      }),
    });

    this.auditService.log({
      event: AuditEvent.PAGE_CREATED,
      resourceType: AuditResource.PAGE,
      resourceId: page.id,
      spaceId: page.spaceId,
      changes: {
        after: { title: getPageTitle(page.title), spaceId: page.spaceId },
      },
      metadata: { templateId: template.id },
    });

    return page;
  }

  async canManage(template: Template, user: User): Promise<boolean> {
    if (this.isWorkspaceAdmin(user)) return true;
    if (template.creatorId === user.id) return true;
    if (!template.spaceId) return false;
    const ability = await this.spaceAbility.createForUser(
      user,
      template.spaceId,
    );
    return ability.can(SpaceCaslAction.Manage, SpaceCaslSubject.Settings);
  }

  private async assertCanManage(template: Template, user: User) {
    if (!(await this.canManage(template, user))) {
      throw new ForbiddenException();
    }
  }

  private async assertCanCreateIn(spaceId: string | null, user: User) {
    if (spaceId === null) {
      if (!this.isWorkspaceAdmin(user)) {
        throw new ForbiddenException(
          'Only workspace admins can create workspace-wide templates',
        );
      }
      return;
    }
    await this.assertSpaceAction(user, spaceId, SpaceCaslAction.Create);
  }

  private async assertSpaceAction(
    user: User,
    spaceId: string,
    action: SpaceCaslAction,
  ) {
    const ability = await this.spaceAbility.createForUser(user, spaceId);
    if (ability.cannot(action, SpaceCaslSubject.Page)) {
      throw new ForbiddenException();
    }
  }

  // Global templates are visible to everyone; space templates to space members.
  private async findViewable(
    templateId: string,
    user: User,
    workspace: Workspace,
    opts?: { includeContent?: boolean },
  ): Promise<Template> {
    const template = await this.templateRepo.findById(
      templateId,
      workspace.id,
      {
        includeContent: opts?.includeContent,
      },
    );
    if (!template) {
      throw new NotFoundException('Template not found');
    }
    if (template.spaceId) {
      const spaceIds = await this.spaceMemberRepo.getUserSpaceIds(user.id);
      if (!spaceIds.includes(template.spaceId)) {
        throw new NotFoundException('Template not found');
      }
    }
    return template;
  }

  private isWorkspaceAdmin(user: User): boolean {
    return user.role === UserRole.ADMIN || user.role === UserRole.OWNER;
  }

  private contentFields(content: Record<string, any> | null | undefined) {
    if (!content) return { content: null, textContent: null };
    try {
      jsonToNode(content);
    } catch {
      throw new BadRequestException('Invalid template content');
    }
    return { content, textContent: jsonToText(content) };
  }
}
