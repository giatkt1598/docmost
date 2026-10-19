export interface ITemplate {
  id: string;
  title: string | null;
  description: string | null;
  icon: string | null;
  spaceId: string | null;
  workspaceId: string;
  creatorId: string | null;
  lastUpdatedById: string | null;
  content?: any;
  creator?: { id: string; name: string; avatarUrl: string | null } | null;
  permissions?: { canManage: boolean };
  createdAt: string;
  updatedAt: string;
}

export interface ICreateTemplate {
  title?: string;
  description?: string;
  icon?: string;
  spaceId?: string | null;
  content?: any;
  sourcePageId?: string;
}

export interface IUpdateTemplate {
  templateId: string;
  title?: string;
  description?: string;
  icon?: string;
  spaceId?: string | null;
  content?: any;
}

export interface ITemplateListParams {
  spaceId?: string;
  query?: string;
  cursor?: string;
  limit?: number;
}
