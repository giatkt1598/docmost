import api from "@/lib/api-client";
import { IPagination } from "@/lib/types";
import {
  IPageVerification,
  IVerificationListItem,
  IVerificationListParams,
  IVerificationSettings,
} from "@/features/page-verification/types/page-verification.types";

export async function getPageVerification(
  pageId: string,
): Promise<IPageVerification> {
  const req = await api.post<IPageVerification>("/page-verifications/info", {
    pageId,
  });
  return req.data;
}

export async function createPageVerification(
  data: IVerificationSettings & { pageId: string },
): Promise<IPageVerification> {
  const req = await api.post<IPageVerification>(
    "/page-verifications/create",
    data,
  );
  return req.data;
}

export async function updatePageVerification(
  data: Partial<IVerificationSettings> & { pageId: string },
): Promise<IPageVerification> {
  const req = await api.post<IPageVerification>(
    "/page-verifications/update",
    data,
  );
  return req.data;
}

export async function deletePageVerification(pageId: string): Promise<void> {
  await api.post("/page-verifications/delete", { pageId });
}

export async function verifyPage(pageId: string): Promise<IPageVerification> {
  const req = await api.post<IPageVerification>("/page-verifications/verify", {
    pageId,
  });
  return req.data;
}

export async function getPageVerifications(
  params?: IVerificationListParams,
): Promise<IPagination<IVerificationListItem>> {
  const req = await api.post<IPagination<IVerificationListItem>>(
    "/page-verifications/list",
    { ...params },
  );
  return req.data;
}
