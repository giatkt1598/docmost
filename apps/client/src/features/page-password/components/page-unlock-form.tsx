import { useEffect, useState } from "react";
import {
  Button,
  Center,
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

interface PageUnlockFormProps {
  page: LockedPageInfo;
  // called once the page is unlocked, to load it again
  onUnlocked: () => void | Promise<unknown>;
}

// Asks for the password of a protected page. Only the title shows until it
// is unlocked.
export function PageUnlockForm({ page, onUnlocked }: PageUnlockFormProps) {
  const { t } = useTranslation();
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  // drop the copy of the document this browser may keep from before the
  // page got its password
  useEffect(() => {
    try {
      indexedDB.deleteDatabase(`page.${page.id}`);
    } catch {
      // storage unavailable
    }
  }, [page.id]);

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

  return (
    <Center px="md" py={60}>
      <Paper withBorder radius="md" p="xl" w="100%" maw={420}>
        <form onSubmit={submit}>
          <Stack gap="md" align="stretch">
            <Center>
              <ThemeIcon size={48} radius="xl" variant="light">
                <IconLock size={26} />
              </ThemeIcon>
            </Center>
            <Stack gap={4} align="center">
              <Title order={4} ta="center" style={{ wordBreak: "break-word" }}>
                {page.icon ? `${page.icon} ` : ""}
                {page.title || t("Untitled")}
              </Title>
              <Text size="sm" c="dimmed" ta="center">
                {t("This page is protected by a password.")}
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
            <Button type="submit" loading={loading} disabled={!password}>
              {t("Unlock")}
            </Button>
          </Stack>
        </form>
      </Paper>
    </Center>
  );
}
