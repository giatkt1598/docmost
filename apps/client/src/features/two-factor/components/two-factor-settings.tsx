import { useState } from "react";
import {
  Badge,
  Button,
  Group,
  Modal,
  PasswordInput,
  Stack,
  Text,
} from "@mantine/core";
import { notifications } from "@mantine/notifications";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useAtomValue } from "jotai";
import { useTranslation } from "react-i18next";
import { workspaceAtom } from "@/features/user/atoms/current-user-atom.ts";
import { TwoFactorSetupFlow } from "@/features/two-factor/components/two-factor-setup-flow";
import { BackupCodesList } from "@/features/two-factor/components/backup-codes-list";
import {
  disableTwoFactor,
  enableTwoFactor,
  getTwoFactorStatus,
  regenerateBackupCodes,
  startTwoFactorSetup,
} from "@/features/two-factor/services/two-factor-service";

const STATUS_KEY = ["two-factor-status"];

type Dialog = "setup" | "disable" | "regenerate" | null;

export function TwoFactorSettings() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const workspace = useAtomValue(workspaceAtom);
  const { data: status } = useQuery({
    queryKey: STATUS_KEY,
    queryFn: getTwoFactorStatus,
  });
  const [dialog, setDialog] = useState<Dialog>(null);
  const [password, setPassword] = useState("");
  const [newCodes, setNewCodes] = useState<string[] | null>(null);
  const [busy, setBusy] = useState(false);

  const close = () => {
    setDialog(null);
    setPassword("");
    setNewCodes(null);
    queryClient.invalidateQueries({ queryKey: STATUS_KEY });
  };

  const withPassword = async () => {
    setBusy(true);
    try {
      if (dialog === "disable") {
        await disableTwoFactor(password);
        notifications.show({ message: t("Two-factor authentication has been disabled") });
        close();
      } else {
        const result = await regenerateBackupCodes(password);
        setNewCodes(result.backupCodes);
        notifications.show({ message: t("New backup codes have been generated") });
      }
    } catch (err: any) {
      notifications.show({
        message: err?.response?.data?.message ?? t("Error"),
        color: "red",
      });
    } finally {
      setBusy(false);
    }
  };

  const enforced = workspace?.enforceMfa === true;

  return (
    <>
      <Group justify="space-between" wrap="nowrap" gap="xl">
        <div>
          <Group gap="xs">
            <Text size="md">{t("2-step verification")}</Text>
            {status?.isEnabled && (
              <Badge color="green" variant="light" size="sm">
                {t("Enabled")}
              </Badge>
            )}
          </Group>
          <Text size="sm" c="dimmed">
            {status?.isEnabled
              ? t("Two-factor authentication is active on your account.")
              : t(
                  "Protect your account with an additional verification layer when signing in.",
                )}
          </Text>
          {status?.isEnabled && (
            <Text size="xs" c="dimmed">
              {t("{{count}} backup codes left", {
                count: status.backupCodesRemaining,
              })}
            </Text>
          )}
        </div>
        {status?.isEnabled ? (
          <Group gap="xs" wrap="nowrap">
            <Button variant="default" size="sm" onClick={() => setDialog("regenerate")}>
              {t("Backup codes")}
            </Button>
            {!enforced && (
              <Button
                variant="default"
                color="red"
                size="sm"
                onClick={() => setDialog("disable")}
              >
                {t("Disable")}
              </Button>
            )}
          </Group>
        ) : (
          <Button size="sm" onClick={() => setDialog("setup")}>
            {t("Add 2FA method")}
          </Button>
        )}
      </Group>

      <Modal
        opened={dialog === "setup"}
        onClose={close}
        title={t("Set up two-factor authentication")}
      >
        {dialog === "setup" && (
          <TwoFactorSetupFlow
            start={startTwoFactorSetup}
            enable={enableTwoFactor}
            onDone={() => {
              notifications.show({ message: t("Two-factor authentication has been enabled") });
              close();
            }}
          />
        )}
      </Modal>

      <Modal
        opened={dialog === "disable" || dialog === "regenerate"}
        onClose={close}
        title={
          dialog === "disable"
            ? t("Disable two-factor authentication")
            : t("Generate new backup codes")
        }
      >
        {newCodes ? (
          <Stack>
            <BackupCodesList codes={newCodes} />
            <Button onClick={close}>{t("I've saved my backup codes")}</Button>
          </Stack>
        ) : (
          <Stack>
            <Text size="sm">
              {dialog === "disable"
                ? t(
                    "Disabling two-factor authentication will make your account less secure. You'll only need your password to sign in.",
                  )
                : t(
                    "You can regenerate new backup codes at any time. This will invalidate all existing codes.",
                  )}
            </Text>
            <PasswordInput
              label={t("Confirm password")}
              value={password}
              onChange={(e) => setPassword(e.currentTarget.value)}
              data-autofocus
            />
            <Group justify="flex-end">
              <Button variant="default" onClick={close}>
                {t("Cancel")}
              </Button>
              <Button
                color={dialog === "disable" ? "red" : undefined}
                loading={busy}
                disabled={!password}
                onClick={withPassword}
              >
                {dialog === "disable" ? t("Disable") : t("Generate new backup codes")}
              </Button>
            </Group>
          </Stack>
        )}
      </Modal>
    </>
  );
}
