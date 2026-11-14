import { useEffect, useState } from "react";
import {
  Alert,
  Badge,
  Button,
  Group,
  PasswordInput,
  Stack,
  Switch,
  Text,
} from "@mantine/core";
import { IconLock, IconLockOpen } from "@tabler/icons-react";
import { modals } from "@mantine/modals";
import { notifications } from "@mantine/notifications";
import { useTranslation } from "react-i18next";
import { useQueryClient } from "@tanstack/react-query";
import {
  refreshTreeLockState,
  removePagePassword,
  setPagePassword,
} from "@/features/page-password/page-password";

const MIN_LENGTH = 4;

interface PagePasswordPanelProps {
  pageId: string;
  hasPassword: boolean;
  includeSubPages: boolean;
  // the ancestor whose password already covers this page
  inheritedFrom?: { id: string; title: string | null } | null;
  readOnly?: boolean;
  // workspace admins and the page creator
  canManage?: boolean;
}

// Share > Password: turn the password on, change it or remove it. The
// password is never shown again once saved.
export function PagePasswordPanel({
  pageId,
  hasPassword,
  includeSubPages: savedIncludeSubPages,
  inheritedFrom,
  readOnly: pageReadOnly,
  canManage = true,
}: PagePasswordPanelProps) {
  const readOnly = pageReadOnly || !canManage;
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState(false);
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [includeSubPages, setIncludeSubPages] = useState(savedIncludeSubPages);
  const [savingSubPages, setSavingSubPages] = useState(false);

  useEffect(() => {
    setIncludeSubPages(savedIncludeSubPages);
  }, [savedIncludeSubPages]);

  // the locks in the page tree: this page and its loaded sub-pages, as the
  // server sees them now
  const refresh = () => {
    void refreshTreeLockState(pageId);
    return Promise.all([
      queryClient.invalidateQueries({ queryKey: ["pages"] }),
      queryClient.invalidateQueries({ queryKey: ["sidebar-pages"] }),
      queryClient.invalidateQueries({ queryKey: ["root-sidebar-pages"] }),
    ]);
  };

  const reset = () => {
    setEditing(false);
    setPassword("");
    setConfirm("");
    setError(null);
  };

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    if (password.length < MIN_LENGTH) {
      setError(
        t("Use at least {{count}} characters", { count: MIN_LENGTH }),
      );
      return;
    }
    if (password !== confirm) {
      setError(t("Passwords do not match"));
      return;
    }
    setSaving(true);
    try {
      await setPagePassword(pageId, { password, includeSubPages });
      await refresh();
      notifications.show({
        message: hasPassword ? t("Password changed") : t("Password set"),
      });
      reset();
    } catch (err: any) {
      setError(err?.response?.data?.message ?? t("Failed to save password"));
    } finally {
      setSaving(false);
    }
  };

  // with a password in place, the switch saves at once; before, it goes
  // with the new password
  const toggleSubPages = async (next: boolean) => {
    setIncludeSubPages(next);
    if (!hasPassword) return;
    setSavingSubPages(true);
    try {
      await setPagePassword(pageId, { includeSubPages: next });
      await refresh();
      notifications.show({
        message: next
          ? t("Sub-pages are now locked with this password")
          : t("Sub-pages are no longer locked with this password"),
      });
    } catch (err: any) {
      setIncludeSubPages(!next);
      notifications.show({
        color: "red",
        message: err?.response?.data?.message ?? t("Failed to save password"),
      });
    } finally {
      setSavingSubPages(false);
    }
  };

  const remove = () =>
    modals.openConfirmModal({
      title: t("Remove the password?"),
      children: (
        <Text size="sm">
          {t(
            "Everyone who can access this page will see its content without a password.",
          )}
        </Text>
      ),
      labels: { confirm: t("Remove"), cancel: t("Cancel") },
      confirmProps: { color: "red" },
      onConfirm: async () => {
        try {
          await removePagePassword(pageId);
          await refresh();
          notifications.show({ message: t("Password removed") });
        } catch (err: any) {
          notifications.show({
            color: "red",
            message:
              err?.response?.data?.message ?? t("Failed to remove password"),
          });
        }
      },
    });

  return (
    <Stack gap="md">
      <Group gap="xs">
        {hasPassword ? (
          <Badge color="orange" variant="light" leftSection={<IconLock size={12} />}>
            {t("Password protected")}
          </Badge>
        ) : (
          <Badge color="gray" variant="light" leftSection={<IconLockOpen size={12} />}>
            {t("No password")}
          </Badge>
        )}
      </Group>
      <Text size="sm" c="dimmed">
        {t(
          "With a password, everyone, editors included, must enter it before seeing the content. The title stays visible. Search, exports and AI do not reveal the content.",
        )}
      </Text>

      {inheritedFrom && (
        <Alert variant="light" color="orange" icon={<IconLock size={16} />}>
          {t("This page is also locked by the password of “{{title}}”.", {
            title: inheritedFrom.title || t("Untitled"),
          })}
        </Alert>
      )}

      <Switch
        label={t("Include sub-pages")}
        description={t("Make sub-pages locked with password too")}
        checked={includeSubPages}
        disabled={readOnly || savingSubPages}
        onChange={(e) => toggleSubPages(e.currentTarget.checked)}
      />

      {readOnly ? (
        <Alert variant="light" color="gray">
          {canManage
            ? t("Only people who can edit this page can manage its password.")
            : t(
                "Only workspace admins and the page creator can manage its password.",
              )}
        </Alert>
      ) : editing ? (
        <form onSubmit={save}>
          <Stack gap="sm">
            <PasswordInput
              label={hasPassword ? t("New password") : t("Password")}
              value={password}
              onChange={(e) => {
                setPassword(e.currentTarget.value);
                setError(null);
              }}
              autoComplete="new-password"
              data-autofocus
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
            <Group justify="flex-end" gap="xs">
              <Button variant="default" onClick={reset}>
                {t("Cancel")}
              </Button>
              <Button type="submit" loading={saving} disabled={!password}>
                {t("Save")}
              </Button>
            </Group>
          </Stack>
        </form>
      ) : (
        <Group gap="xs">
          <Button
            variant="default"
            leftSection={<IconLock size={16} />}
            onClick={() => setEditing(true)}
          >
            {hasPassword ? t("Change password") : t("Set a password")}
          </Button>
          {hasPassword && (
            <Button variant="subtle" color="red" onClick={remove}>
              {t("Remove password")}
            </Button>
          )}
        </Group>
      )}
    </Stack>
  );
}
