import { useEffect, useState } from "react";
import {
  Alert,
  Button,
  Checkbox,
  Group,
  Modal,
  PasswordInput,
  Select,
  Stack,
  TextInput,
} from "@mantine/core";
import { useTranslation } from "react-i18next";
import {
  DATADOG_SITES,
  SIEM_TYPE_LABELS,
  SiemDestination,
  SiemTestResult,
  SiemType,
} from "@/features/siem/types/siem.types";
import {
  useCreateSiemDestinationMutation,
  useTestSiemDestinationMutation,
  useUpdateSiemDestinationMutation,
} from "@/features/siem/queries/siem-query";

type Props = {
  opened: boolean;
  destination: SiemDestination | null;
  onClose: () => void;
};

const DEFAULT_CONFIG: Record<SiemType, Record<string, any>> = {
  http: { format: "json" },
  splunk_hec: {},
  datadog: { site: DATADOG_SITES[0] },
};

export function SiemDestinationModal({ opened, destination, onClose }: Props) {
  const { t } = useTranslation();
  const [name, setName] = useState("");
  const [type, setType] = useState<SiemType>("http");
  const [config, setConfig] = useState<Record<string, any>>(
    DEFAULT_CONFIG.http,
  );
  const [secret, setSecret] = useState("");
  const [testResult, setTestResult] = useState<SiemTestResult | null>(null);

  const create = useCreateSiemDestinationMutation();
  const update = useUpdateSiemDestinationMutation();
  const test = useTestSiemDestinationMutation();

  useEffect(() => {
    if (!opened) return;
    setName(destination?.name ?? "");
    setType(destination?.type ?? "http");
    setConfig(destination?.config ?? DEFAULT_CONFIG.http);
    setSecret("");
    setTestResult(null);
  }, [opened, destination]);

  const field = (key: string) => ({
    value: config[key] ?? "",
    onChange: (e: React.ChangeEvent<HTMLInputElement>) =>
      setConfig({ ...config, [key]: e.currentTarget.value }),
  });

  const secrets = secret
    ? { [type === "datadog" ? "apiKey" : "token"]: secret }
    : {};
  const hasStoredSecret =
    destination?.hasSecrets[type === "datadog" ? "apiKey" : "token"];
  const secretRequired = type !== "http" && !hasStoredSecret;
  const tlsSkipped = config.tls?.rejectUnauthorized === false;

  const submit = () => {
    if (destination) {
      update.mutate(
        { destinationId: destination.id, name, config, secrets },
        { onSuccess: onClose },
      );
    } else {
      create.mutate({ name, type, config, secrets }, { onSuccess: onClose });
    }
  };

  const runTest = () => {
    setTestResult(null);
    test.mutate(
      { type, config, secrets, destinationId: destination?.id },
      { onSuccess: setTestResult },
    );
  };

  return (
    <Modal
      opened={opened}
      onClose={onClose}
      title={destination ? t("Edit destination") : t("Add destination")}
    >
      <Stack gap="sm">
        <TextInput
          label={t("Name")}
          required
          value={name}
          onChange={(e) => setName(e.currentTarget.value)}
        />
        <Select
          label={t("Type")}
          disabled={!!destination}
          allowDeselect={false}
          value={type}
          data={Object.entries(SIEM_TYPE_LABELS).map(([value, label]) => ({
            value,
            label: t(label),
          }))}
          onChange={(value) => {
            const next = value as SiemType;
            setType(next);
            setConfig(DEFAULT_CONFIG[next]);
            setTestResult(null);
          }}
        />

        {type === "datadog" ? (
          <>
            <Select
              label={t("Site")}
              allowDeselect={false}
              data={DATADOG_SITES}
              value={config.site}
              onChange={(site) => setConfig({ ...config, site })}
            />
            <TextInput label={t("Service")} {...field("service")} />
            <TextInput label={t("Tags")} {...field("tags")} />
          </>
        ) : (
          <TextInput
            label={t("URL")}
            required
            placeholder="https://"
            {...field("url")}
          />
        )}

        {type === "http" && (
          <>
            <Select
              label={t("Format")}
              allowDeselect={false}
              data={[
                { value: "json", label: "JSON" },
                { value: "ndjson", label: "NDJSON" },
              ]}
              value={config.format}
              onChange={(format) => setConfig({ ...config, format })}
            />
            <Group grow>
              <TextInput
                label={t("Auth header")}
                placeholder="Authorization"
                {...field("authHeaderName")}
              />
              <TextInput
                label={t("Auth prefix")}
                placeholder={config.authHeaderName ? "" : "Bearer"}
                {...field("authHeaderPrefix")}
              />
            </Group>
          </>
        )}

        {type === "splunk_hec" && (
          <>
            <TextInput label={t("Index")} {...field("index")} />
            <TextInput label={t("Source")} {...field("source")} />
            <TextInput label={t("Source type")} {...field("sourcetype")} />
            <TextInput label={t("Channel ID")} {...field("channelId")} />
          </>
        )}

        <PasswordInput
          label={type === "datadog" ? t("API key") : t("Token")}
          required={secretRequired}
          placeholder={hasStoredSecret ? t("Saved. Leave blank to keep.") : ""}
          value={secret}
          onChange={(e) => setSecret(e.currentTarget.value)}
          autoComplete="new-password"
        />

        {type !== "datadog" && (
          <Checkbox
            label={t("Skip TLS certificate verification")}
            checked={tlsSkipped}
            onChange={(e) =>
              setConfig({
                ...config,
                tls: e.currentTarget.checked
                  ? { rejectUnauthorized: false }
                  : undefined,
              })
            }
          />
        )}

        {testResult && (
          <Alert color={testResult.delivered ? "green" : "red"} variant="light">
            {testResult.delivered
              ? t("Test event delivered")
              : (testResult.error ?? t("Something went wrong"))}
          </Alert>
        )}

        <Group justify="flex-end" gap="xs">
          <Button variant="default" loading={test.isPending} onClick={runTest}>
            {t("Send test event")}
          </Button>
          <Button
            disabled={!name.trim() || (secretRequired && !secret)}
            loading={create.isPending || update.isPending}
            onClick={submit}
          >
            {t("Save")}
          </Button>
        </Group>
      </Stack>
    </Modal>
  );
}
