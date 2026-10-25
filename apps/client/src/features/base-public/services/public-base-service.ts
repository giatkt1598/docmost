import api from "@/lib/api-client";
import {
  FilterGroup,
  IBase,
  IBaseRow,
  RowReferences,
  ViewSortConfig,
} from "@/ee/base/types/base.types";
import { IPagination } from "@/lib/types";
import { PublicBaseAccess } from "@/features/base-public/public-base-context";

export type PublicRowsPage = IPagination<IBaseRow> & {
  references: RowReferences;
};

export async function getPublicBase(
  pageId: string,
  access: PublicBaseAccess,
): Promise<IBase> {
  const req = await api.post<IBase>("/bases/public/info", {
    pageId,
    ...access,
  });
  return req.data;
}

export async function getPublicBaseRows(params: {
  pageId: string;
  access: PublicBaseAccess;
  cursor?: string;
  filter?: FilterGroup;
  sorts?: ViewSortConfig[];
}): Promise<PublicRowsPage> {
  const { access, ...rest } = params;
  const req = await api.post<PublicRowsPage>("/bases/public/rows", {
    ...rest,
    ...access,
    limit: 100,
  });
  return req.data;
}
