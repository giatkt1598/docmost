import { useState } from "react";
import {
  Alert,
  Anchor,
  Box,
  Button,
  Container,
  Group,
  PinInput,
  Stack,
  Text,
  TextInput,
  Title,
} from "@mantine/core";
import { Link, useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { AuthLayout } from "@/features/auth/components/auth-layout.tsx";
import classes from "@/features/auth/components/auth.module.css";
import { DocumentTitle } from "@/components/ui/document-title.tsx";
import APP_ROUTE, { getPostLoginRedirect } from "@/lib/app-route.ts";
import { verifyTwoFactorLogin } from "@/features/two-factor/services/two-factor-service";

export default function TwoFactorChallenge() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [useBackup, setUseBackup] = useState(false);
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (value = code) => {
    if (!value.trim()) return;
    setBusy(true);
    setError(null);
    try {
      await verifyTwoFactorLogin(value.trim());
      navigate(getPostLoginRedirect(), { replace: true });
    } catch (err: any) {
      const status = err?.response?.status;
      setError(
        status === 401 && /expired/i.test(err?.response?.data?.message ?? "")
          ? t("Your sign-in session has expired. Please log in again.")
          : t("Invalid verification code"),
      );
      setCode("");
    } finally {
      setBusy(false);
    }
  };

  return (
    <AuthLayout>
      <DocumentTitle title={t("Two-factor authentication")} />
      <Container size={420} className={classes.container}>
        <Box p="xl" className={classes.containerBox}>
          <Title order={1} size="h2" ta="center" fw={500} mb="md">
            {t("Two-factor authentication")}
          </Title>
          <Stack>
            <Text size="sm" c="dimmed" ta="center">
              {useBackup
                ? t("Enter one of your backup codes. Each backup code can only be used once.")
                : t("Enter the 6-digit code found in your authenticator app")}
            </Text>

            {useBackup ? (
              <TextInput
                value={code}
                onChange={(e) => setCode(e.currentTarget.value)}
                placeholder="xxxxx-xxxxx"
                aria-label={t("Backup code")}
                autoComplete="one-time-code"
                data-autofocus
              />
            ) : (
              <Group justify="center">
                <PinInput
                  length={6}
                  type="number"
                  oneTimeCode
                  value={code}
                  onChange={setCode}
                  onComplete={submit}
                  disabled={busy}
                  autoFocus
                  aria-label={t("Enter the 6-digit code found in your authenticator app")}
                />
              </Group>
            )}

            {error && <Alert color="red">{error}</Alert>}

            <Button onClick={() => submit()} loading={busy} fullWidth>
              {t("Verify")}
            </Button>

            <Group justify="space-between">
              <Anchor
                component="button"
                size="sm"
                onClick={() => {
                  setUseBackup(!useBackup);
                  setCode("");
                  setError(null);
                }}
              >
                {useBackup ? t("Use authenticator app instead") : t("Use backup code")}
              </Anchor>
              <Anchor component={Link} to={APP_ROUTE.AUTH.LOGIN} size="sm">
                {t("Back")}
              </Anchor>
            </Group>
          </Stack>
        </Box>
      </Container>
    </AuthLayout>
  );
}
