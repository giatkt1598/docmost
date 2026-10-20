import { useEffect, useState } from "react";
import {
  Alert,
  Button,
  Center,
  Code,
  Group,
  Image,
  Loader,
  PinInput,
  Stack,
  Text,
} from "@mantine/core";
import { useTranslation } from "react-i18next";
import { BackupCodesList } from "@/features/two-factor/components/backup-codes-list";
import {
  BackupCodes,
  TwoFactorSetup,
} from "@/features/two-factor/services/two-factor-service";

interface TwoFactorSetupFlowProps {
  start: () => Promise<TwoFactorSetup>;
  enable: (code: string) => Promise<BackupCodes>;
  // called after the backup codes have been acknowledged
  onDone: () => void;
}

// Scan the QR code, confirm a code, then show the backup codes once.
export function TwoFactorSetupFlow({
  start,
  enable,
  onDone,
}: TwoFactorSetupFlowProps) {
  const { t } = useTranslation();
  const [setup, setSetup] = useState<TwoFactorSetup | null>(null);
  const [codes, setCodes] = useState<string[] | null>(null);
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [showSecret, setShowSecret] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    start()
      .then(setSetup)
      .catch((err) =>
        setError(err?.response?.data?.message ?? t("Failed to set up MFA")),
      );
    // start once per mount
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const submit = async (value = code) => {
    if (value.length !== 6) return;
    setBusy(true);
    setError(null);
    try {
      const result = await enable(value);
      setCodes(result.backupCodes);
    } catch (err: any) {
      setError(err?.response?.data?.message ?? t("Invalid verification code"));
      setCode("");
    } finally {
      setBusy(false);
    }
  };

  if (codes) {
    return (
      <Stack>
        <Text fw={500}>{t("Save your backup codes")}</Text>
        <BackupCodesList codes={codes} />
        <Button onClick={onDone}>{t("I've saved my backup codes")}</Button>
      </Stack>
    );
  }

  if (!setup) {
    return error ? (
      <Alert color="red">{error}</Alert>
    ) : (
      <Center p="md">
        <Loader size="sm" />
      </Center>
    );
  }

  return (
    <Stack>
      <Text size="sm">
        {t("1. Scan this QR code with your authenticator app")}
      </Text>
      <Center>
        <Image
          src={setup.qrCodeDataUrl}
          w={180}
          h={180}
          alt={t("MFA QR Code")}
        />
      </Center>
      {showSecret ? (
        <Stack gap={4}>
          <Text size="xs" c="dimmed">
            {t("Enter this code manually in your authenticator app:")}
          </Text>
          <Code ta="center" style={{ wordBreak: "break-all" }}>
            {setup.secret}
          </Code>
        </Stack>
      ) : (
        <Button variant="subtle" size="xs" onClick={() => setShowSecret(true)}>
          {t("Can't scan the code?")}
        </Button>
      )}

      <Text size="sm">
        {t("2. Enter the 6-digit code from your authenticator")}
      </Text>
      <Group justify="center">
        <PinInput
          length={6}
          type="number"
          oneTimeCode
          value={code}
          onChange={setCode}
          onComplete={submit}
          disabled={busy}
          aria-label={t("Enter the 6-digit code found in your authenticator app")}
        />
      </Group>
      {error && <Alert color="red">{error}</Alert>}
      <Button onClick={() => submit()} loading={busy} disabled={code.length !== 6}>
        {t("Verify and enable")}
      </Button>
    </Stack>
  );
}
