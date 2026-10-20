import api from "@/lib/api-client";

export type TwoFactorStatus = {
  isEnabled: boolean;
  method: string | null;
  backupCodesRemaining: number;
};

export type TwoFactorSetup = {
  secret: string;
  otpauthUrl: string;
  qrCodeDataUrl: string;
};

export type BackupCodes = { backupCodes: string[] };

// Signed-in management of your own two-factor settings.
export async function getTwoFactorStatus(): Promise<TwoFactorStatus> {
  const req = await api.post<TwoFactorStatus>("/two-factor/status");
  return req.data;
}

export async function startTwoFactorSetup(): Promise<TwoFactorSetup> {
  const req = await api.post<TwoFactorSetup>("/two-factor/setup");
  return req.data;
}

export async function enableTwoFactor(code: string): Promise<BackupCodes> {
  const req = await api.post<BackupCodes>("/two-factor/enable", { code });
  return req.data;
}

export async function disableTwoFactor(password: string): Promise<void> {
  await api.post("/two-factor/disable", { password });
}

export async function regenerateBackupCodes(
  password: string,
): Promise<BackupCodes> {
  const req = await api.post<BackupCodes>(
    "/two-factor/regenerate-backup-codes",
    { password },
  );
  return req.data;
}

// Second step of a password login (authorized by a short-lived cookie).
export async function verifyTwoFactorLogin(code: string): Promise<void> {
  await api.post("/two-factor/login/verify", { code });
}

export async function startRequiredTwoFactorSetup(): Promise<TwoFactorSetup> {
  const req = await api.post<TwoFactorSetup>("/two-factor/login/setup");
  return req.data;
}

export async function enableRequiredTwoFactor(
  code: string,
): Promise<BackupCodes> {
  const req = await api.post<BackupCodes>("/two-factor/login/enable", {
    code,
  });
  return req.data;
}
