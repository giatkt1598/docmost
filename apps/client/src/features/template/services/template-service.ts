import api from "@/lib/api-client";
import { IPagination } from "@/lib/types.ts";
import { IPage } from "@/features/page/types/page.types";
import {
  ICreateTemplate,
  ITemplate,
  ITemplateListParams,
  IUpdateTemplate,
} from "@/features/template/types/template.types";

export async function getTemplates(
  params?: ITemplateListParams,
): Promise<IPagination<ITemplate>> {
  const req = await api.post<IPagination<ITemplate>>("/page-templates", {
    ...params,
  });
  return req.data;
}

export async function getTemplateById(templateId: string): Promise<ITemplate> {
  const req = await api.post<ITemplate>("/page-templates/info", { templateId });
  return req.data;
}

export async function createTemplate(
  data: ICreateTemplate,
): Promise<ITemplate> {
  const req = await api.post<ITemplate>("/page-templates/create", data);
  return req.data;
}

export async function updateTemplate(
  data: IUpdateTemplate,
): Promise<ITemplate> {
  const req = await api.post<ITemplate>("/page-templates/update", data);
  return req.data;
}

export async function deleteTemplate(templateId: string): Promise<void> {
  await api.post("/page-templates/delete", { templateId });
}

export async function createPageFromTemplate(data: {
  templateId: string;
  spaceId: string;
  parentPageId?: string;
}): Promise<IPage> {
  const req = await api.post<IPage>("/page-templates/use", data);
  return req.data;
}
