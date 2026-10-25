import { Injectable, NotFoundException } from '@nestjs/common';
import { Page, Workspace } from '@docmost/db/types/entity.types';
import { PageRepo } from '@docmost/db/repos/page/page.repo';
import { PagePermissionRepo } from '@docmost/db/repos/page/page-permission.repo';
import { ShareRepo } from '@docmost/db/repos/share/share.repo';
import { ShareService } from '../share/share.service';
import { PublicSpaceService } from '../public-space/public-space.service';
import { BaseService } from './base.service';
import { BaseRowService } from './base-row.service';
import { PublicBaseDto, PublicListRowsDto } from './dto/base.dto';

// True when the ProseMirror document has a base embed for the given page.
export function embedsBase(content: unknown, basePageId: string): boolean {
  const stack: any[] = [content];
  while (stack.length) {
    const node = stack.pop();
    if (!node || typeof node !== 'object') continue;
    if (node.type === 'base' && node.attrs?.pageId === basePageId) return true;
    if (Array.isArray(node.content)) stack.push(...node.content);
  }
  return false;
}

// Read-only access to bases for people who are not signed in: through a
// public share or a published space. A base is visible when it is shared
// itself, or when a shared page embeds it; restricted pages never are.
@Injectable()
export class BasePublicService {
  constructor(
    private readonly baseService: BaseService,
    private readonly rowService: BaseRowService,
    private readonly pageRepo: PageRepo,
    private readonly pagePermissionRepo: PagePermissionRepo,
    private readonly shareRepo: ShareRepo,
    private readonly shareService: ShareService,
    private readonly publicSpaceService: PublicSpaceService,
  ) {}

  async info(dto: PublicBaseDto, workspace: Workspace) {
    const page = await this.resolve(dto, workspace);
    const base = await this.baseService.getInfo(page, {
      canEdit: false,
      hasRestriction: false,
    });
    return { ...base, creatorId: null };
  }

  async rows(dto: PublicListRowsDto, workspace: Workspace) {
    const page = await this.resolve(dto, workspace);
    return this.rowService.list(page, dto, null);
  }

  private async resolve(dto: PublicBaseDto, workspace: Workspace): Promise<Page> {
    const notFound = new NotFoundException('Base not found');
    const page = await this.baseService.getBasePage(dto.pageId, workspace.id);

    let allowed = false;
    if (dto.shareId) {
      allowed = await this.allowedByShare(page, dto, workspace.id);
    } else if (dto.spaceSlug) {
      const { space } = await this.publicSpaceService.getPublicSpace(
        dto.spaceSlug,
        workspace,
      );
      allowed = page.spaceId === space.id;
    }
    if (!allowed) throw notFound;
    if (await this.pagePermissionRepo.hasRestrictedAncestor(page.id)) {
      throw notFound;
    }
    return page;
  }

  private async allowedByShare(
    page: Page,
    dto: PublicBaseDto,
    workspaceId: string,
  ): Promise<boolean> {
    const share = await this.shareRepo.findById(dto.shareId);
    if (!share || share.workspaceId !== workspaceId) return false;
    if (!(await this.shareService.isSharingAllowed(workspaceId, share.spaceId))) {
      return false;
    }
    if (await this.isShared(page.id, workspaceId)) return true;

    if (!dto.hostPageId) return false;
    const host = await this.pageRepo.findById(dto.hostPageId, {
      includeContent: true,
    });
    if (!host || host.deletedAt || host.workspaceId !== workspaceId) {
      return false;
    }
    if (!embedsBase(host.content, page.id)) return false;
    if (!(await this.isShared(host.id, workspaceId))) return false;
    return !(await this.pagePermissionRepo.hasRestrictedAncestor(host.id));
  }

  private async isShared(pageId: string, workspaceId: string) {
    const share = await this.shareService.getShareForPage(pageId, workspaceId);
    if (!share) return false;
    return this.shareService.isSharingAllowed(workspaceId, share.spaceId);
  }
}
