import { useState } from "react";
import {
  Alert,
  Badge,
  Button,
  Group,
  PasswordInput,
  Stack,
  Text,
} from "@mantine/core";
import { IconLock, IconLockOpen } from "@tabler/icons-react";
import { modals } from "@mantine/modals";
import { notifications } from "@mantine/notifications";
import { useTranslation } from "react-i18next";
import { useQueryClient } from "@tanstack/react-query";
import { useSetAtom } from "jotai";
import {
  removePagePassword,
  setPagePassword,
} from "@/features/page-password/page-password";
import { treeDataAtom } from "@/features/page/tree/atoms/tree-data-atom.ts";
import { treeModel } from "@/features/page/tree/model/tree-model";
import type { SpaceTreeNode } from "@/features/page/tree/types.ts";

const MIN_LENGTH = 4;

interface PagePasswordPanelProps {
  pageId: string;
  hasPassword: boolean;
  readOnly?: boolean;
}

// Share > Password: turn the password on, change it or remove it. The
// password is never shown again once saved.
export function PagePasswordPanel({
  pageId,
  hasPassword,
  readOnly,
}: PagePasswordPanelProps) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const setTreeData = useSetAtom(treeDataAtom);
  const [editing, setEditing] = useState(false);
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = (protectedNow: boolean) => {
    // the lock in the page tree
    setTreeData((prev) =>
      treeModel.update(prev, pageId, {
        hasPassword: protectedNow,
      } as Partial<SpaceTreeNode>),
    );
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
      await setPagePassword(pageId, password);
      await refresh(true);
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
          await refresh(false);
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

      {readOnly ? (
        <Alert variant="light" color="gray">
          {t("Only people who can edit this page can manage its password.")}
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
