export type PagePermissionRole = "reader" | "writer";

export interface IPageRestrictionInfo {
  restrictionId: string | null;
  hasDirectRestriction: boolean;
  hasInheritedRestriction: boolean;
  inheritedFrom: { id: string; slugId: string; title: string } | null;
  userAccess: { canView: boolean; canEdit: boolean; canManage: boolean };
}

interface IPagePermissionBase {
  id: string;
  name: string;
  role: PagePermissionRole;
  createdAt: string;
}

export type IPagePermissionMember =
  | (IPagePermissionBase & {
      type: "user";
      email: string;
      avatarUrl: string | null;
    })
  | (IPagePermissionBase & {
      type: "group";
      memberCount: number;
      isDefault: boolean;
    });

export interface IPagePermissionTargets {
  userIds?: string[];
  groupIds?: string[];
}
