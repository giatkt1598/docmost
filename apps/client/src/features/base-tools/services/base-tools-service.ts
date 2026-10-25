import api from "@/lib/api-client";
import { IBaseRow } from "@/ee/base/types/base.types";
import { IPagination } from "@/lib/types";

export type CsvImportResult = {
  imported: number;
  createdProperties: string[];
  skippedColumns: string[];
};

export type RowPage = {
  id: string;
  slugId: string;
  title: string | null;
  spaceSlug: string | null;
  created: boolean;
};

export async function searchBaseRows(
  pageId: string,
  search: string,
): Promise<IPagination<IBaseRow>> {
  const req = await api.post<IPagination<IBaseRow>>("/bases/rows", {
    pageId,
    search,
    limit: 20,
  });
  return req.data;
}

export async function importBaseCsv(
  pageId: string,
  file: File,
  createMissing: boolean,
): Promise<CsvImportResult> {
  // the server reads the fields before the file, so they go first
  const formData = new FormData();
  formData.append("pageId", pageId);
  formData.append("createMissing", String(createMissing));
  formData.append("file", file);
  const req = await api.post<CsvImportResult>("/bases/import-csv", formData, {
    headers: { "Content-Type": "multipart/form-data" },
  });
  return req.data;
}

export async function openRowPage(
  pageId: string,
  rowId: string,
): Promise<RowPage> {
  const req = await api.post<RowPage>("/bases/rows/page", { pageId, rowId });
  return req.data;
}
