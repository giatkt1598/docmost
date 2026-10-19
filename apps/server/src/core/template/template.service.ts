import {
  BadRequestException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { User, Workspace } from '@docmost/db/types/entity.types';
import { TemplateRepo } from '@docmost/db/repos/template/template.repo';
import { PageRepo } from '@docmost/db/repos/page/page.repo';
import { SpaceMemberRepo } from '@docmost/db/repos/space/space-member.repo';
import { PaginationOptions } from '@docmost/db/pagination/pagination-options';
import { SpaceCaslAction } from '../casl/interfaces/space-ability.type';
import { PageAccessService } from '../page/page-access/page-access.service';
import { PageService } from '../page/services/page.service';
import { getPageTitle } from '../../common/helpers';
import { jsonToNode, jsonToText } from '../../collaboration/collaboration.util';
import { AuditEvent, AuditResource } from '../../common/events/audit-events';
import {
  AUDIT_SERVICE,
  IAuditService,
} from '../../integrations/audit/audit.service';
import { TemplateAccessService } from './template-access.service';
import { TemplateAttachmentService } from './template-attachment.service';
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
    private readonly templateAccess: TemplateAccessService,
    private readonly templateAttachments: TemplateAttachmentService,
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
        permissions: {
          canManage: await this.templateAccess.canManage(template, user),
        },
      })),
    );

    return { ...result, items };
  }

  async getInfo(templateId: string, user: User, workspace: Workspace) {
    const template = await this.templateAccess.findViewable(
      templateId,
      user,
      workspace.id,
      { includeContent: true },
    );
    return {
      ...template,
      permissions: {
        canManage: await this.templateAccess.canManage(template, user),
      },
    };
  }

  async create(dto: CreateTemplateDto, user: User, workspace: Workspace) {
    const spaceId = dto.spaceId ?? null;
    await this.templateAccess.assertCanCreateIn(spaceId, user);

    let { title, icon, content } = dto;
    let copies = [];
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

      // the template gets its own copy of the page's files
      const clone = await this.templateAttachments.prepareClone(
        content ?? page.content,
        { pageId: page.id },
        workspace.id,
      );
      content = clone.content;
      copies = clone.copies;
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

    await this.templateAttachments.commitClone(
      copies,
      { templateId: id },
      spaceId,
    );

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
    const template = await this.templateAccess.findViewable(
      dto.templateId,
      user,
      workspace.id,
    );
    await this.templateAccess.assertCanManage(template, user);

    const scopeChanged =
      dto.spaceId !== undefined && (dto.spaceId ?? null) !== template.spaceId;
    if (scopeChanged) {
      await this.templateAccess.assertCanCreateIn(dto.spaceId ?? null, user);
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
    const template = await this.templateAccess.findViewable(
      templateId,
      user,
      workspace.id,
    );
    await this.templateAccess.assertCanManage(template, user);

    await this.templateAttachments.deleteTemplateFiles(template.id);
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
    const template = await this.templateAccess.findViewable(
      dto.templateId,
      user,
      workspace.id,
      { includeContent: true },
    );

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
      await this.templateAccess.assertSpaceAction(
        user,
        dto.spaceId,
        SpaceCaslAction.Create,
      );
    }

    // the new page gets its own copy of the template's files
    const { content, copies } = await this.templateAttachments.prepareClone(
      template.content,
      { templateId: template.id },
      workspace.id,
    );

    const page = await this.pageService.create(user.id, workspace.id, {
      title: template.title ?? undefined,
      icon: template.icon ?? undefined,
      spaceId: dto.spaceId,
      parentPageId: dto.parentPageId,
      ...(content && { content: content as object, format: 'json' }),
    });

    await this.templateAttachments.commitClone(
      copies,
      { pageId: page.id },
      dto.spaceId,
    );

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
