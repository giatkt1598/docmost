import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Template, User, Workspace } from '@docmost/db/types/entity.types';
import { TemplateRepo } from '@docmost/db/repos/template/template.repo';
import { SpaceMemberRepo } from '@docmost/db/repos/space/space-member.repo';
import SpaceAbilityFactory from '../casl/abilities/space-ability.factory';
import {
  SpaceCaslAction,
  SpaceCaslSubject,
} from '../casl/interfaces/space-ability.type';
import { UserRole } from '../../common/helpers/types/permission';

// Template permission rules, shared by the template API and file attachments.
@Injectable()
export class TemplateAccessService {
  constructor(
    private readonly templateRepo: TemplateRepo,
    private readonly spaceMemberRepo: SpaceMemberRepo,
    private readonly spaceAbility: SpaceAbilityFactory,
  ) {}

  // Global templates are visible to everyone; space templates to space members.
  async findViewable(
    templateId: string,
    user: User,
    workspaceId: string,
    opts?: { includeContent?: boolean },
  ): Promise<Template> {
    const template = await this.templateRepo.findById(templateId, workspaceId, {
      includeContent: opts?.includeContent,
    });
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

  // Without allowMemberTemplates only workspace admins create and manage
  // templates; everyone can still use them.
  membersMayAuthor(workspace: Workspace): boolean {
    const settings = workspace.settings as any;
    return settings?.templates?.allowMemberTemplates === true;
  }

  async canManage(
    template: Template,
    user: User,
    workspace: Workspace,
  ): Promise<boolean> {
    if (this.isWorkspaceAdmin(user)) return true;
    if (!this.membersMayAuthor(workspace)) return false;
    if (template.creatorId === user.id) return true;
    if (!template.spaceId) return false;
    const ability = await this.spaceAbility.createForUser(
      user,
      template.spaceId,
    );
    return ability.can(SpaceCaslAction.Manage, SpaceCaslSubject.Settings);
  }

  async assertCanManage(
    template: Template,
    user: User,
    workspace: Workspace,
  ): Promise<void> {
    if (!(await this.canManage(template, user, workspace))) {
      throw new ForbiddenException();
    }
  }

  async assertCanCreateIn(
    spaceId: string | null,
    user: User,
    workspace: Workspace,
  ): Promise<void> {
    if (!this.isWorkspaceAdmin(user) && !this.membersMayAuthor(workspace)) {
      throw new ForbiddenException(
        'Only workspace admins can create templates',
      );
    }
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

  async assertSpaceAction(
    user: User,
    spaceId: string,
    action: SpaceCaslAction,
  ): Promise<void> {
    const ability = await this.spaceAbility.createForUser(user, spaceId);
    if (ability.cannot(action, SpaceCaslSubject.Page)) {
      throw new ForbiddenException();
    }
  }

  private isWorkspaceAdmin(user: User): boolean {
    return user.role === UserRole.ADMIN || user.role === UserRole.OWNER;
  }
}
