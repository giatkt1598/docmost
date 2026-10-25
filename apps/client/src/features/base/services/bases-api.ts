import type { AxiosRequestConfig } from "axios";
import { saveAs } from "file-saver";
import api from "@/lib/api-client";
import { IPagination } from "@/lib/types";
import {
  Base,
  BaseChanges,
  BaseProperty,
  BaseRow,
  BaseView,
  CsvImportSummary,
  NewBaseFields,
  NewPropertyFields,
  NewRowFields,
  NewViewFields,
  PropertyChangeResult,
  PropertyChanges,
  PublicAccess,
  RefPage,
  RowChanges,
  RowDocPage,
  RowFilter,
  RowQuery,
  RowsChunk,
  SeedTemplate,
  ViewChanges,
} from "@/features/base/types/base.types";
import { fileNameFromDisposition } from "@/features/base/utils/download";
import { normalizeRowQuery } from "@/features/base/utils/rows-params";

export const ROWS_PAGE_SIZE = 100;

// All bases endpoints are POST under /api/bases. The axios interceptor
// unwraps the HTTP body; `.data` then unwraps the { data, success } envelope.
async function call<TRes = void>(
  path: string,
  body?: unknown,
  config?: AxiosRequestConfig,
): Promise<TRes> {
  const res = await api.post<TRes>(`/bases${path}`, body, config);
  return res?.data as TRes;
}

// Only send the optional keys that have a value.
function compact<T extends Record<string, unknown>>(obj: T): Partial<T> {
  return Object.fromEntries(
    Object.entries(obj).filter(([, v]) => v !== undefined),
  ) as Partial<T>;
}

function rowsBody(query: RowQuery, cursor?: string, limit = ROWS_PAGE_SIZE) {
  return { ...normalizeRowQuery(query), ...compact({ cursor }), limit };
}

export const basesApi = {
  base: {
    list: (spaceId: string, cursor?: string, limit = 50) =>
      call<IPagination<Base>>("", compact({ spaceId, cursor, limit })),

    create: (fields: NewBaseFields) => call<Base>("/create", fields),

    // turns an empty page into a base
    convert: (pageId: string, template?: SeedTemplate) =>
      call<Base>("/convert", compact({ pageId, template })),

    info: (pageId: string) => call<Base>("/info", { pageId }),

    update: (pageId: string, changes: BaseChanges) =>
      call<Base>("/update", { pageId, ...changes }),

    remove: (pageId: string) => call("/delete", { pageId }),

    async exportCsv(pageId: string, filter?: RowFilter): Promise<void> {
      // export-csv is a file download: the interceptor hands back the
      // whole response for it
      const res: any = await api.post(
        "/bases/export-csv",
        compact({ pageId, filter }),
        { responseType: "blob" },
      );
      const name =
        fileNameFromDisposition(res?.headers?.["content-disposition"]) ??
        "base.csv";
      saveAs(res.data, name);
    },

    importCsv(pageId: string, file: File, createMissing: boolean) {
      // the server reads the text fields before the file part
      const form = new FormData();
      form.append("pageId", pageId);
      form.append("createMissing", String(createMissing));
      form.append("file", file);
      return call<CsvImportSummary>("/import-csv", form, {
        headers: { "Content-Type": "multipart/form-data" },
      });
    },

    // pages the user may open, among those ids
    expandPages: async (pageIds: string[]) =>
      (await call<{ items: RefPage[] }>("/pages/expand", { pageIds })).items,
  },

  properties: {
    create: (pageId: string, fields: NewPropertyFields, requestId?: string) =>
      call<BaseProperty>("/properties/create", { pageId, ...fields, ...compact({ requestId }) }),

    update: (
      pageId: string,
      propertyId: string,
      changes: PropertyChanges,
      requestId?: string,
    ) =>
      call<PropertyChangeResult>("/properties/update", {
        pageId,
        propertyId,
        ...changes,
        ...compact({ requestId }),
      }),

    remove: (pageId: string, propertyId: string, requestId?: string) =>
      call("/properties/delete", { pageId, propertyId, ...compact({ requestId }) }),

    reorder: (pageId: string, propertyId: string, position: string, requestId?: string) =>
      call("/properties/reorder", {
        pageId,
        propertyId,
        position,
        ...compact({ requestId }),
      }),
  },

  rows: {
    list: (pageId: string, query: RowQuery = {}, cursor?: string, limit?: number) =>
      call<RowsChunk>("/rows", { pageId, ...rowsBody(query, cursor, limit) }),

    get: (pageId: string, rowId: string) =>
      call<BaseRow>("/rows/info", { pageId, rowId }),

    create: (pageId: string, fields: NewRowFields, requestId?: string) =>
      call<BaseRow>("/rows/create", { pageId, ...fields, ...compact({ requestId }) }),

    update: (pageId: string, rowId: string, changes: RowChanges, requestId?: string) =>
      call<BaseRow>("/rows/update", {
        pageId,
        rowId,
        ...changes,
        ...compact({ requestId }),
      }),

    remove: (pageId: string, rowId: string, requestId?: string) =>
      call("/rows/delete", { pageId, rowId, ...compact({ requestId }) }),

    removeMany: (pageId: string, rowIds: string[], requestId?: string) =>
      call("/rows/delete-many", { pageId, rowIds, ...compact({ requestId }) }),

    // undo of deletes within the retention window
    restore: (pageId: string, rowIds: string[], requestId?: string) =>
      call<{ items: BaseRow[] }>("/rows/restore", {
        pageId,
        rowIds,
        ...compact({ requestId }),
      }),

    reorder: (pageId: string, rowId: string, position: string, requestId?: string) =>
      call("/rows/reorder", { pageId, rowId, position, ...compact({ requestId }) }),

    // the row's own page, created on first use
    openPage: (pageId: string, rowId: string) =>
      call<RowDocPage>("/rows/page", { pageId, rowId }),
  },

  views: {
    list: (pageId: string) => call<BaseView[]>("/views", { pageId }),

    create: (pageId: string, fields: NewViewFields) =>
      call<BaseView>("/views/create", { pageId, ...fields }),

    update: (pageId: string, viewId: string, changes: ViewChanges) =>
      call<BaseView>("/views/update", { pageId, viewId, ...changes }),

    remove: (pageId: string, viewId: string) =>
      call("/views/delete", { pageId, viewId }),
  },

  publicView: {
    info: (pageId: string, access: PublicAccess) =>
      call<Base>("/public/info", { pageId, ...access }),

    rows: (pageId: string, access: PublicAccess, query: RowQuery = {}, cursor?: string) =>
      call<RowsChunk>("/public/rows", {
        pageId,
        ...access,
        ...rowsBody(query, cursor),
      }),
  },
};
