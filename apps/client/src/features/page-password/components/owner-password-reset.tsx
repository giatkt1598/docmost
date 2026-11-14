import { useState } from "react";
import {
  Alert,
  Anchor,
  Button,
  Group,
  PasswordInput,
  Stack,
  Text,
} from "@mantine/core";
import { IconShieldLock } from "@tabler/icons-react";
import { useTranslation } from "react-i18next";
import {
  removePagePassword,
  setPagePassword,
} from "@/features/page-password/page-password";

const MIN_LENGTH = 4;

interface OwnerPasswordResetProps {
  pageId: string;
  // called once the password is reset or removed, to load the page again
  onDone: () => void | Promise<unknown>;
}

// For the workspace owner on a locked page: reset or remove its password
// without knowing it. The server audits it and tells the page creator and
// whoever set the password.
export function OwnerPasswordReset({ pageId, onDone }: OwnerPasswordResetProps) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<"reset" | "remove" | null>(null);

  if (!open) {
    return (
      <Anchor
        component="button"
        type="button"
        size="sm"
        ta="center"
        onClick={() => setOpen(true)}
      >
        {t("Forgot the password? Reset it as workspace owner")}
      </Anchor>
    );
  }

  const run = async (kind: "reset" | "remove") => {
    if (kind === "reset") {
      if (password.length < MIN_LENGTH) {
        setError(t("Use at least {{count}} characters", { count: MIN_LENGTH }));
        return;
      }
      if (password !== confirm) {
        setError(t("Passwords do not match"));
        return;
      }
    }
    setBusy(kind);
    setError(null);
    try {
      if (kind === "reset") await setPagePassword(pageId, { password });
      else await removePagePassword(pageId);
      await onDone();
    } catch (err: any) {
      setError(err?.response?.data?.message ?? t("Failed to save password"));
    } finally {
      setBusy(null);
    }
  };

  return (
    <Stack gap="sm">
      <Alert
        variant="light"
        color="orange"
        icon={<IconShieldLock size={16} />}
        title={t("Reset as workspace owner")}
      >
        <Text size="sm">
          {t(
            "You can set a new password or remove it without knowing the current one. This is recorded in the audit log, and the page creator and whoever set the password are notified.",
          )}
        </Text>
      </Alert>
      <PasswordInput
        label={t("New password")}
        value={password}
        onChange={(e) => {
          setPassword(e.currentTarget.value);
          setError(null);
        }}
        autoComplete="new-password"
      />
      <PasswordInput
        label={t("Confirm password")}
        value={confirm}
        onChange={(e) => {
          setConfirm(e.currentTarget.value);
          setError(null);
        }}
        autoComplete="new-password"
        error={error}
      />
      <Group justify="space-between" gap="xs">
        <Button variant="default" onClick={() => setOpen(false)}>
          {t("Cancel")}
        </Button>
        <Group gap="xs">
          <Button
            variant="subtle"
            color="red"
            loading={busy === "remove"}
            disabled={busy !== null}
            onClick={() => run("remove")}
          >
            {t("Remove password")}
          </Button>
          <Button
            loading={busy === "reset"}
            disabled={busy !== null || !password}
            onClick={() => run("reset")}
          >
            {t("Set new password")}
          </Button>
        </Group>
      </Group>
    </Stack>
  );
}
