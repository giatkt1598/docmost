import api from "@/lib/api-client";
import { UnfurlResult } from "../types/integration.types";
import { getInstalledIntegrations } from "../services/integration-service";

export const SPRINT_BOOT_TYPE = "sprint-boot";

export type SprintBootSpace = {
  key: string;
  name: string;
  docmostSpaceId?: string | null;
};

// Sprint Boot answers as the signed-in person, matched by email.
export async function getSprintBootSpaces(): Promise<SprintBootSpace[]> {
  const req = await api.post<SprintBootSpace[]>("/integrations/sprint-boot/spaces");
  return req.data;
}

export async function searchSprintBootTickets(data: {
  query?: string;
  spaceKey?: string;
  limit?: number;
}): Promise<UnfurlResult[]> {
  const req = await api.post<UnfurlResult[]>("/integrations/sprint-boot/search", data);
  return req.data;
}

export async function createSprintBootTicket(data: {
  spaceKey: string;
  type?: string;
  title: string;
  description?: string;
}): Promise<UnfurlResult> {
  const req = await api.post<UnfurlResult>(
    "/integrations/sprint-boot/create-ticket",
    data,
  );
  return req.data;
}

// Read where no query client is in reach, such as slash commands. The answer is refreshed in the background, and the
// editor's Sprint Boot button keeps it current too.
const RECHECK_MS = 5 * 60 * 1000;
let installed = false;
let checkedAt = 0;

export const setSprintBootInstalled = (value: boolean) => {
  installed = value;
  checkedAt = Date.now();
};

export const isSprintBootInstalled = () => {
  if (Date.now() - checkedAt > RECHECK_MS) {
    checkedAt = Date.now();
    void getInstalledIntegrations()
      .then((list) => setSprintBootInstalled(list.some((item) => item.type === SPRINT_BOOT_TYPE)))
      .catch(() => undefined);
  }
  return installed;
};

// Linking from Settings > Integrations: off to Sprint Boot to authorize, no secret to copy.
export async function startSprintBootLink(sprintBootUrl: string): Promise<{ authorizeUrl: string }> {
  const req = await api.post<{ authorizeUrl: string }>("/integrations/sprint-boot/start-link", { sprintBootUrl });
  return req.data;
}

export async function previewSprintBootLink(data: {
  sprintBootUrl: string;
  state: string;
}): Promise<{ sprintBootUrl: string; spaces: { key: string; name: string }[] }> {
  const req = await api.post<{ sprintBootUrl: string; spaces: { key: string; name: string }[] }>(
    "/integrations/sprint-boot/link-preview",
    data,
  );
  return req.data;
}

export async function authorizeSprintBootLink(data: {
  sprintBootUrl: string;
  state: string;
  spaceKey?: string;
  docmostSpaceId?: string;
  newSpaceName?: string;
}): Promise<{ returnUrl: string }> {
  const req = await api.post<{ returnUrl: string }>("/integrations/sprint-boot/authorize", data);
  return req.data;
}
