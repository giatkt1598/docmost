import { useEffect, useState } from "react";
import {
  Button,
  Center,
  Group,
  Paper,
  PasswordInput,
  Stack,
  Text,
  ThemeIcon,
  Title,
} from "@mantine/core";
import { IconLock } from "@tabler/icons-react";
import { useTranslation } from "react-i18next";
import {
  isInvalidPasswordError,
  LockedPageInfo,
  unlockPage,
} from "@/features/page-password/page-password";
import useUserRole from "@/hooks/use-user-role.tsx";
import { OwnerPasswordReset } from "@/features/page-password/components/owner-password-reset";

interface PageUnlockFormProps {
  page: LockedPageInfo;
  // called once the page is unlocked, to load it again
  onUnlocked: () => void | Promise<unknown>;
  // inside a dialog: no card around it, with a Cancel button
  onCancel?: () => void;
  // offer the workspace owner to reset a forgotten password
  allowOwnerReset?: boolean;
}

// Asks for the password of a protected page. Only titles show until it is
// unlocked.
export function PageUnlockForm({
  page,
  onUnlocked,
  onCancel,
  allowOwnerReset,
}: PageUnlockFormProps) {
  const { t } = useTranslation();
  const { isOwner } = useUserRole();
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const shown = page.requestedPage ?? page;

  // drop the copy of the document this browser may keep from before the
  // page got its password
  useEffect(() => {
    try {
      indexedDB.deleteDatabase(`page.${shown.id}`);
    } catch {
      // storage unavailable
    }
  }, [shown.id]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!password || loading) return;
    setLoading(true);
    setError(null);
    try {
      await unlockPage(page.id, password);
      await onUnlocked();
    } catch (err: any) {
      setError(
        isInvalidPasswordError(err)
          ? t("Incorrect password. Please try again.")
          : err?.response?.status === 429
            ? t("Too many attempts. Please wait a minute and try again.")
            : (err?.response?.data?.message ?? t("Unable to unlock the page.")),
      );
      setPassword("");
    } finally {
      setLoading(false);
    }
  };

  const form = (
    <form onSubmit={submit}>
      <Stack gap="md" align="stretch">
        <Center>
          <ThemeIcon size={48} radius="xl" variant="light">
            <IconLock size={26} />
          </ThemeIcon>
        </Center>
        <Stack gap={4} align="center">
          <Title order={4} ta="center" style={{ wordBreak: "break-word" }}>
            {shown.icon ? `${shown.icon} ` : ""}
            {shown.title || t("Untitled")}
          </Title>
          <Text size="sm" c="dimmed" ta="center">
            {page.requestedPage
              ? t("This page is protected by the password of “{{title}}”.", {
                  title: page.title || t("Untitled"),
                })
              : t("This page is protected by a password.")}
          </Text>
        </Stack>
        <PasswordInput
          label={t("Password")}
          value={password}
          onChange={(e) => {
            setPassword(e.currentTarget.value);
            setError(null);
          }}
          error={error}
          autoComplete="current-password"
          data-autofocus
          autoFocus
        />
        {onCancel ? (
          <Group justify="flex-end" gap="xs">
            <Button variant="default" onClick={onCancel}>
              {t("Cancel")}
            </Button>
            <Button type="submit" loading={loading} disabled={!password}>
              {t("Unlock")}
            </Button>
          </Group>
        ) : (
          <Button type="submit" loading={loading} disabled={!password}>
            {t("Unlock")}
          </Button>
        )}
      </Stack>
    </form>
  );

  const ownerReset =
    allowOwnerReset && isOwner ? (
      <OwnerPasswordReset pageId={page.id} onDone={onUnlocked} />
    ) : null;

  if (onCancel) return form;

  return (
    <Center px="md" py={60}>
      <Paper withBorder radius="md" p="xl" w="100%" maw={420}>
        <Stack gap="lg">
          {form}
          {ownerReset}
        </Stack>
      </Paper>
    </Center>
  );
}
