import { useEffect, useState } from "react";
import {
  ActionIcon,
  Alert,
  Anchor,
  Badge,
  Button,
  Code,
  Group,
  List,
  Modal,
  PasswordInput,
  Stack,
  Text,
  TextInput,
  Title,
  Tooltip,
} from "@mantine/core";
import { IconCheck, IconCopy } from "@tabler/icons-react";
import { useTranslation } from "react-i18next";
import { CopyButton } from "@/components/common/copy-button";
import { useSaveIntegrationConfig } from "../queries/integration-query";
import {
  Integration,
  IntegrationConfig,
  IntegrationDefinition,
} from "../types/integration.types";

type IntegrationSetupModalProps = {
  opened: boolean;
  onClose: () => void;
  definition: IntegrationDefinition;
  config?: IntegrationConfig;
  installation?: Integration;
};

function registrationUrl(
  definition: IntegrationDefinition,
  baseUrl: string,
): string | null {
  const { setup } = definition;
  if (setup?.appRegistrationUrl) return setup.appRegistrationUrl;
  const host = baseUrl.trim().replace(/\/+$/, "") || setup?.defaultBaseUrl;
  if (!setup?.appRegistrationPath || !/^https?:\/\//i.test(host ?? "")) {
    return null;
  }
  return `${host}${setup.appRegistrationPath}`;
}

export default function IntegrationSetupModal({
  opened,
  onClose,
  definition,
  config,
  installation,
}: IntegrationSetupModalProps) {
  const { t } = useTranslation();
  const saveMutation = useSaveIntegrationConfig();
  const [baseUrl, setBaseUrl] = useState("");
  const [clientId, setClientId] = useState("");
  const [clientSecret, setClientSecret] = useState("");

  useEffect(() => {
    if (!opened) return;
    setBaseUrl(config?.baseUrl ?? "");
    setClientId(config?.clientId ?? "");
    setClientSecret("");
  }, [opened, config]);

  const { name, setup, oauth } = definition;
  const baseUrlMode = setup?.baseUrl ?? "none";
  const usesApiToken = setup?.auth === "apiToken";
  const appUrl = registrationUrl(definition, baseUrl);
  const callbackUrl = config?.callbackUrl ?? "";

  const baseUrlChanged =
    !!config?.hasClientSecret &&
    baseUrl.trim().replace(/\/+$/, "") !== (config.baseUrl ?? "");

  const breaksConnections =
    !usesApiToken &&
    !!installation &&
    !!config?.clientId &&
    (baseUrlChanged || clientId.trim() !== config.clientId);

  const canSave =
    (usesApiToken || !!clientId.trim()) &&
    (!!clientSecret || (!!config?.hasClientSecret && !baseUrlChanged)) &&
    (baseUrlMode !== "required" || !!baseUrl.trim());

  const handleSave = () => {
    saveMutation.mutate(
      {
        type: definition.type,
        baseUrl: baseUrlMode === "none" ? undefined : baseUrl.trim(),
        clientId: usesApiToken ? undefined : clientId.trim(),
        clientSecret: clientSecret || undefined,
      },
      { onSuccess: onClose },
    );
  };

  const firstStep = usesApiToken
    ? t(
        "Sign in to {{name}} and create an access token under Your account > Access tokens. Use an account that can only see the files you want to preview.",
        { name },
      )
    : definition.type === "gitea"
      ? t(
          "On your Gitea server, open Settings > Applications and create a new OAuth2 application. Keep \"Confidential client\" ticked.",
        )
      : t("Create a new OAuth app in {{name}}.", { name });

  return (
    <Modal
      opened={opened}
      onClose={onClose}
      size="lg"
      title={t("Set up {{name}}", { name })}
    >
      <Stack gap="md">
        <div>
          <Title order={5} mb={4}>
            {t("What it does")}
          </Title>
          <Text size="sm">{definition.description}</Text>
          <Text size="sm" c="dimmed" mt={4}>
            {t(
              "Paste a {{name}} link into a page and Docmost can show it as a card with its details, always up to date.",
              { name },
            )}
          </Text>
        </div>

        <div>
          <Title order={5} mb={4}>
            {t("How to set it up")}
          </Title>
          <List type="ordered" size="sm" spacing={6}>
            <List.Item>
              {firstStep}{" "}
              {appUrl && (
                <Anchor
                  href={appUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  size="sm"
                >
                  {t("Open {{name}}", { name })}
                </Anchor>
              )}
            </List.Item>
            {!usesApiToken && (
            <List.Item>
              {t("Use this as the redirect (callback) URL:")}
              <Group gap={4} wrap="nowrap" mt={4}>
                <Code style={{ wordBreak: "break-all" }}>{callbackUrl}</Code>
                <CopyButton value={callbackUrl}>
                  {({ copied, copy }) => (
                    <Tooltip label={copied ? t("Copied") : t("Copy")}>
                      <ActionIcon
                        variant="subtle"
                        color="gray"
                        onClick={copy}
                        aria-label={t("Copy")}
                      >
                        {copied ? (
                          <IconCheck size={16} />
                        ) : (
                          <IconCopy size={16} />
                        )}
                      </ActionIcon>
                    </Tooltip>
                  )}
                </CopyButton>
              </Group>
            </List.Item>
            )}
            <List.Item>
              {usesApiToken
                ? t("Paste the token into the form below.")
                : t("Copy the client ID and client secret into the form below.")}
            </List.Item>
            <List.Item>
              {usesApiToken
                ? t("Save, then press Install.")
                : t(
                    "Save, then press Install to authorize with your own {{name}} account.",
                    { name },
                  )}
            </List.Item>
            {!usesApiToken && (
              <List.Item>
                {t(
                  "Each member connects their own account in Settings > Connections.",
                )}
              </List.Item>
            )}
          </List>

          {!!oauth?.scopes?.length && (
            <Group gap={4} mt="xs">
              <Text size="xs" c="dimmed">
                {t("Permissions requested:")}
              </Text>
              {oauth.scopes.map((scope) => (
                <Badge key={scope} size="xs" variant="default" tt="none">
                  {scope}
                </Badge>
              ))}
            </Group>
          )}
        </div>

        {usesApiToken && (
          <Alert color="blue">
            {t(
              "Everyone in this workspace shares this token. Any member who pastes a {{name}} link sees the file's name if the token's account can open it.",
              { name },
            )}
          </Alert>
        )}

        <Stack gap="xs">
          {baseUrlMode !== "none" && (
            <TextInput
              label={t("Server URL")}
              description={
                baseUrlMode === "required"
                  ? t("The address of your {{name}} server.", { name })
                  : t(
                      "Only for a self-hosted server. Leave empty for {{host}}.",
                      { host: setup?.defaultBaseUrl },
                    )
              }
              placeholder={
                baseUrlMode === "required"
                  ? "https://gitea.example.com"
                  : setup?.defaultBaseUrl
              }
              required={baseUrlMode === "required"}
              value={baseUrl}
              onChange={(e) => setBaseUrl(e.currentTarget.value)}
            />
          )}
          {!usesApiToken && (
            <TextInput
              label={t("Client ID")}
              required
              autoComplete="off"
              value={clientId}
              onChange={(e) => setClientId(e.currentTarget.value)}
            />
          )}
          <PasswordInput
            label={usesApiToken ? t("Access token") : t("Client secret")}
            description={
              baseUrlChanged
                ? t("Enter it again because the server changed.")
                : config?.hasClientSecret
                  ? t("A secret is saved. Leave empty to keep it.")
                  : t("Stored encrypted and never shown again.")
            }
            required={!config?.hasClientSecret || baseUrlChanged}
            autoComplete="new-password"
            value={clientSecret}
            onChange={(e) => setClientSecret(e.currentTarget.value)}
          />
        </Stack>

        {breaksConnections && (
          <Alert color="yellow">
            {t(
              "Changing the server or client ID disconnects every member from {{name}}. They will need to connect again.",
              { name },
            )}
          </Alert>
        )}

        <Group justify="flex-end">
          <Button variant="default" onClick={onClose}>
            {t("Cancel")}
          </Button>
          <Button
            disabled={!canSave}
            loading={saveMutation.isPending}
            onClick={handleSave}
          >
            {t("Save")}
          </Button>
        </Group>
      </Stack>
    </Modal>
  );
}
