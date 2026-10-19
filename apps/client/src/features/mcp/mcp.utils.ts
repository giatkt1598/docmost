import { getAppUrl } from "@/lib/config.ts";

export function getMcpServerUrl(): string {
  return `${getAppUrl()}/api/mcp-server`;
}
