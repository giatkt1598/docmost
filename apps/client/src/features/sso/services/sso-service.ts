import api from "@/lib/api-client";
import {
  ISsoProvider,
  ISsoProviderInput,
} from "@/features/sso/types/sso.types";

export async function getSsoProviders(): Promise<ISsoProvider[]> {
  const req = await api.post<ISsoProvider[]>("/sso-providers");
  return req.data;
}

export async function createSsoProvider(
  data: ISsoProviderInput & { type: string; name: string },
): Promise<ISsoProvider> {
  const req = await api.post<ISsoProvider>("/sso-providers/create", data);
  return req.data;
}

export async function updateSsoProvider(
  data: ISsoProviderInput & { providerId: string },
): Promise<ISsoProvider> {
  const req = await api.post<ISsoProvider>("/sso-providers/update", data);
  return req.data;
}

export async function deleteSsoProvider(providerId: string): Promise<void> {
  await api.post("/sso-providers/delete", { providerId });
}

export function buildSsoLoginUrl(providerId: string, redirect?: string | null) {
  const params = new URLSearchParams();
  if (redirect) params.set("redirect", redirect);
  const query = params.toString();
  return `/api/auth-sso/${providerId}/login${query ? `?${query}` : ""}`;
}

export async function ldapLogin(
  providerId: string,
  data: { username: string; password: string },
): Promise<{ userHasMfa?: boolean; requiresMfaSetup?: boolean } | undefined> {
  const req = await api.post(`/auth-sso/${providerId}/ldap-login`, data);
  return req.data;
}
