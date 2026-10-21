import api from "@/lib/api-client";
import { IPagination } from "@/lib/types";
import {
  IPagePermissionMember,
  IPagePermissionTargets,
  IPageRestrictionInfo,
  PagePermissionRole,
} from "@/features/page-permission/types/page-permission.types";

export async function getPageRestrictionInfo(
  pageId: string,
): Promise<IPageRestrictionInfo> {
  const req = await api.post<IPageRestrictionInfo>("/page-permissions/info", {
    pageId,
  });
  return req.data;
}

export async function getPagePermissions(
  pageId: string,
  cursor?: string,
): Promise<IPagination<IPagePermissionMember>> {
  const req = await api.post<IPagination<IPagePermissionMember>>(
    "/page-permissions/list",
    { pageId, limit: 100, ...(cursor && { cursor }) },
  );
  return req.data;
}

export async function restrictPage(pageId: string): Promise<void> {
  await api.post("/page-permissions/restrict", { pageId });
}

export async function unrestrictPage(pageId: string): Promise<void> {
  await api.post("/page-permissions/unrestrict", { pageId });
}

export async function addPagePermissions(
  data: { pageId: string; role: PagePermissionRole } & IPagePermissionTargets,
): Promise<void> {
  await api.post("/page-permissions/add", data);
}

export async function removePagePermissions(
  data: { pageId: string } & IPagePermissionTargets,
): Promise<void> {
  await api.post("/page-permissions/remove", data);
}

export async function updatePagePermissionRole(data: {
  pageId: string;
  role: PagePermissionRole;
  userId?: string;
  groupId?: string;
}): Promise<void> {
  await api.post("/page-permissions/update-role", data);
}
