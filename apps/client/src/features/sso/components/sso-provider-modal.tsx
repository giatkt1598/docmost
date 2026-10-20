import { useEffect, useState } from "react";
import {
  ActionIcon,
  Button,
  CopyButton,
  Group,
  Modal,
  PasswordInput,
  SegmentedControl,
  Stack,
  Switch,
  Text,
  TextInput,
  Tooltip,
} from "@mantine/core";
import { IconCheck, IconCopy } from "@tabler/icons-react";
import { useTranslation } from "react-i18next";
import { ISsoProvider, SsoProviderType } from "@/features/sso/types/sso.types";
import {
  useCreateSsoProviderMutation,
  useUpdateSsoProviderMutation,
} from "@/features/sso/queries/sso-query";

interface SsoProviderModalProps {
  opened: boolean;
  onClose: () => void;
  provider?: ISsoProvider | null;
}

type FormState = {
  type: SsoProviderType;
  name: string;
  oidcIssuer: string;
  oidcClientId: string;
  oidcClientSecret: string;
  isEnabled: boolean;
  allowSignup: boolean;
  groupSync: boolean;
};

function initialState(provider?: ISsoProvider | null): FormState {
  return {
    type: provider?.type ?? "oidc",
    name: provider?.name ?? "",
    oidcIssuer: provider?.oidcIssuer ?? "",
    oidcClientId: provider?.oidcClientId ?? "",
    oidcClientSecret: "",
    isEnabled: provider?.isEnabled ?? true,
    allowSignup: provider?.allowSignup ?? false,
    groupSync: provider?.groupSync ?? false,
  };
}

export function SsoProviderModal({
  opened,
  onClose,
  provider,
}: SsoProviderModalProps) {
  const { t } = useTranslation();
  // after creating, the modal stays open on the new provider to show its callback URL
  const [current, setCurrent] = useState<ISsoProvider | null>(provider ?? null);
  const [form, setForm] = useState<FormState>(initialState(provider));
  const createMutation = useCreateSsoProviderMutation();
  const updateMutation = useUpdateSsoProviderMutation();

  useEffect(() => {
    if (opened) {
      setCurrent(provider ?? null);
      setForm(initialState(provider));
    }
  }, [opened, provider]);

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) =>
    setForm((prev) => ({ ...prev, [key]: value }));

  const isOidc = form.type === "oidc";
  const hasSecret = current?.hasOidcClientSecret === true;
  const canSave =
    form.name.trim() &&
    form.oidcClientId.trim() &&
    (!isOidc || form.oidcIssuer.trim()) &&
    (hasSecret || form.oidcClientSecret);

  const onSubmit = async () => {
    const values = {
      name: form.name.trim(),
      oidcClientId: form.oidcClientId.trim(),
      ...(isOidc && { oidcIssuer: form.oidcIssuer.trim() }),
      ...(form.oidcClientSecret && {
        oidcClientSecret: form.oidcClientSecret,
      }),
      isEnabled: form.isEnabled,
      allowSignup: form.allowSignup,
      groupSync: form.groupSync,
    };

    if (current) {
      await updateMutation.mutateAsync({ providerId: current.id, ...values });
      onClose();
    } else {
      const created = await createMutation.mutateAsync({
        type: form.type,
        ...values,
      });
      setCurrent(created);
      setForm(initialState(created));
    }
  };

  const saving = createMutation.isPending || updateMutation.isPending;

  return (
    <Modal
      opened={opened}
      onClose={onClose}
      title={current ? t("Edit SSO provider") : t("Add SSO provider")}
      size="lg"
    >
      <Stack>
        {!current && (
          <SegmentedControl
            value={form.type}
            onChange={(value) => set("type", value as SsoProviderType)}
            data={[
              { label: "OpenID Connect", value: "oidc" },
              { label: "Google", value: "google" },
            ]}
          />
        )}

        <TextInput
          label={t("Display name")}
          description={t("Shown on the login button")}
          placeholder={isOidc ? "Keycloak" : "Google"}
          value={form.name}
          onChange={(e) => set("name", e.currentTarget.value)}
          required
        />

        {isOidc && (
          <TextInput
            label={t("Issuer URL")}
            placeholder="https://idp.example.com/realms/acme"
            value={form.oidcIssuer}
            onChange={(e) => set("oidcIssuer", e.currentTarget.value)}
            required
          />
        )}

        <TextInput
          label={t("Client ID")}
          value={form.oidcClientId}
          onChange={(e) => set("oidcClientId", e.currentTarget.value)}
          required
        />

        <PasswordInput
          label={t("Client secret")}
          placeholder={
            hasSecret ? t("Leave empty to keep the current secret") : undefined
          }
          value={form.oidcClientSecret}
          onChange={(e) => set("oidcClientSecret", e.currentTarget.value)}
          required={!hasSecret}
          autoComplete="new-password"
        />

        {current ? (
          <TextInput
            label={t("Callback URL")}
            description={t(
              "Register this redirect URI with your identity provider.",
            )}
            value={current.callbackUrl}
            readOnly
            rightSection={
              <CopyButton value={current.callbackUrl}>
                {({ copied, copy }) => (
                  <Tooltip label={copied ? t("Copied") : t("Copy")}>
                    <ActionIcon
                      variant="subtle"
                      color={copied ? "teal" : "gray"}
                      onClick={copy}
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
            }
          />
        ) : (
          <Text size="sm" c="dimmed">
            {t("The callback URL is shown after the provider is created.")}
          </Text>
        )}

        <Switch
          label={t("Enabled")}
          checked={form.isEnabled}
          onChange={(e) => set("isEnabled", e.currentTarget.checked)}
        />
        <Switch
          label={t("Allow sign-up")}
          description={t(
            "Create an account on first login for users who are not members yet.",
          )}
          checked={form.allowSignup}
          onChange={(e) => set("allowSignup", e.currentTarget.checked)}
        />
        <Switch
          label={t("Group sync")}
          description={t(
            "Add users to workspace groups that match the groups claim from the provider.",
          )}
          checked={form.groupSync}
          onChange={(e) => set("groupSync", e.currentTarget.checked)}
        />

        <Group justify="flex-end" mt="sm">
          <Button variant="default" onClick={onClose}>
            {current && !provider ? t("Done") : t("Cancel")}
          </Button>
          <Button onClick={onSubmit} disabled={!canSave} loading={saving}>
            {current ? t("Save") : t("Create")}
          </Button>
        </Group>
      </Stack>
    </Modal>
  );
}
