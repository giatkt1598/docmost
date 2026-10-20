import { useEffect, useState } from "react";
import {
  ActionIcon,
  Button,
  CopyButton,
  Group,
  Modal,
  PasswordInput,
  SegmentedControl,
  SimpleGrid,
  Stack,
  Switch,
  Text,
  Textarea,
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
  samlUrl: string;
  samlCertificate: string;
  ldapUrl: string;
  ldapBindDn: string;
  ldapBindPassword: string;
  ldapBaseDn: string;
  ldapUserSearchFilter: string;
  ldapEmailAttribute: string;
  ldapNameAttribute: string;
  ldapGroupsAttribute: string;
  ldapTlsEnabled: boolean;
  ldapTlsCaCert: string;
  isEnabled: boolean;
  allowSignup: boolean;
  groupSync: boolean;
};

const DEFAULT_NAMES: Record<SsoProviderType, string> = {
  oidc: "Keycloak",
  google: "Google",
  saml: "Okta",
  ldap: "Active Directory",
};

function initialState(provider?: ISsoProvider | null): FormState {
  const attrs = provider?.ldapUserAttributes ?? {};
  return {
    type: provider?.type ?? "oidc",
    name: provider?.name ?? "",
    oidcIssuer: provider?.oidcIssuer ?? "",
    oidcClientId: provider?.oidcClientId ?? "",
    oidcClientSecret: "",
    samlUrl: provider?.samlUrl ?? "",
    samlCertificate: provider?.samlCertificate ?? "",
    ldapUrl: provider?.ldapUrl ?? "",
    ldapBindDn: provider?.ldapBindDn ?? "",
    ldapBindPassword: "",
    ldapBaseDn: provider?.ldapBaseDn ?? "",
    ldapUserSearchFilter:
      provider?.ldapUserSearchFilter ?? "(uid={{username}})",
    ldapEmailAttribute: attrs.email ?? "",
    ldapNameAttribute: attrs.name ?? "",
    ldapGroupsAttribute: attrs.groups ?? "",
    ldapTlsEnabled: provider?.ldapTlsEnabled ?? false,
    ldapTlsCaCert: provider?.ldapTlsCaCert ?? "",
    isEnabled: provider?.isEnabled ?? true,
    allowSignup: provider?.allowSignup ?? false,
    groupSync: provider?.groupSync ?? false,
  };
}

function CopyField({
  label,
  description,
  value,
}: {
  label: string;
  description?: string;
  value: string;
}) {
  const { t } = useTranslation();
  return (
    <TextInput
      label={label}
      description={description}
      value={value}
      readOnly
      rightSection={
        <CopyButton value={value}>
          {({ copied, copy }) => (
            <Tooltip label={copied ? t("Copied") : t("Copy")}>
              <ActionIcon
                variant="subtle"
                color={copied ? "teal" : "gray"}
                onClick={copy}
              >
                {copied ? <IconCheck size={16} /> : <IconCopy size={16} />}
              </ActionIcon>
            </Tooltip>
          )}
        </CopyButton>
      }
    />
  );
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

  const { type } = form;
  const isOauth = type === "oidc" || type === "google";
  const hasClientSecret = current?.hasOidcClientSecret === true;

  const canSave =
    !!form.name.trim() &&
    (type === "oidc" || type === "google"
      ? !!form.oidcClientId.trim() &&
        (type === "google" || !!form.oidcIssuer.trim()) &&
        (hasClientSecret || !!form.oidcClientSecret)
      : type === "saml"
        ? !!form.samlUrl.trim() && !!form.samlCertificate.trim()
        : !!form.ldapUrl.trim() &&
          !!form.ldapBaseDn.trim() &&
          form.ldapUserSearchFilter.includes("{{username}}"));

  const typeValues = () => {
    if (isOauth) {
      return {
        oidcClientId: form.oidcClientId.trim(),
        ...(type === "oidc" && { oidcIssuer: form.oidcIssuer.trim() }),
        ...(form.oidcClientSecret && {
          oidcClientSecret: form.oidcClientSecret,
        }),
      };
    }
    if (type === "saml") {
      return {
        samlUrl: form.samlUrl.trim(),
        samlCertificate: form.samlCertificate.trim(),
      };
    }
    const attributes = Object.fromEntries(
      [
        ["email", form.ldapEmailAttribute],
        ["name", form.ldapNameAttribute],
        ["groups", form.ldapGroupsAttribute],
      ]
        .map(([k, v]) => [k, v.trim()])
        .filter(([, v]) => v),
    );
    return {
      ldapUrl: form.ldapUrl.trim(),
      ldapBindDn: form.ldapBindDn.trim(),
      ...(form.ldapBindPassword && {
        ldapBindPassword: form.ldapBindPassword,
      }),
      ldapBaseDn: form.ldapBaseDn.trim(),
      ldapUserSearchFilter: form.ldapUserSearchFilter.trim(),
      ldapUserAttributes: attributes,
      ldapTlsEnabled: form.ldapTlsEnabled,
      ldapTlsCaCert: form.ldapTlsCaCert.trim(),
    };
  };

  const onSubmit = async () => {
    const values = {
      name: form.name.trim(),
      ...typeValues(),
      isEnabled: form.isEnabled,
      allowSignup: form.allowSignup,
      groupSync: form.groupSync,
    };

    if (current) {
      await updateMutation.mutateAsync({ providerId: current.id, ...values });
      onClose();
    } else {
      const created = await createMutation.mutateAsync({ type, ...values });
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
            value={type}
            onChange={(value) => set("type", value as SsoProviderType)}
            data={[
              { label: "OpenID Connect", value: "oidc" },
              { label: "Google", value: "google" },
              { label: "SAML", value: "saml" },
              { label: "LDAP", value: "ldap" },
            ]}
          />
        )}

        <TextInput
          label={t("Display name")}
          description={t("Shown on the login button")}
          placeholder={DEFAULT_NAMES[type]}
          value={form.name}
          onChange={(e) => set("name", e.currentTarget.value)}
          required
        />

        {type === "oidc" && (
          <TextInput
            label={t("Issuer URL")}
            placeholder="https://idp.example.com/realms/acme"
            value={form.oidcIssuer}
            onChange={(e) => set("oidcIssuer", e.currentTarget.value)}
            required
          />
        )}

        {isOauth && (
          <>
            <TextInput
              label={t("Client ID")}
              value={form.oidcClientId}
              onChange={(e) => set("oidcClientId", e.currentTarget.value)}
              required
            />
            <PasswordInput
              label={t("Client secret")}
              placeholder={
                hasClientSecret
                  ? t("Leave empty to keep the current secret")
                  : undefined
              }
              value={form.oidcClientSecret}
              onChange={(e) => set("oidcClientSecret", e.currentTarget.value)}
              required={!hasClientSecret}
              autoComplete="new-password"
            />
          </>
        )}

        {type === "saml" && (
          <>
            <TextInput
              label={t("IdP sign-in URL")}
              description={t(
                "The SAML single sign-on URL of your identity provider.",
              )}
              placeholder="https://idp.example.com/app/sso/saml"
              value={form.samlUrl}
              onChange={(e) => set("samlUrl", e.currentTarget.value)}
              required
            />
            <Textarea
              label={t("IdP signing certificate")}
              description={t("X.509 certificate in PEM format.")}
              placeholder="-----BEGIN CERTIFICATE-----"
              autosize
              minRows={3}
              maxRows={8}
              styles={{ input: { fontFamily: "monospace", fontSize: 12 } }}
              value={form.samlCertificate}
              onChange={(e) => set("samlCertificate", e.currentTarget.value)}
              required
            />
          </>
        )}

        {type === "ldap" && (
          <>
            <TextInput
              label={t("LDAP URL")}
              placeholder="ldaps://ldap.example.com:636"
              value={form.ldapUrl}
              onChange={(e) => set("ldapUrl", e.currentTarget.value)}
              required
            />
            <SimpleGrid cols={{ base: 1, sm: 2 }}>
              <TextInput
                label={t("Bind DN")}
                placeholder="cn=docmost,ou=services,dc=example,dc=com"
                value={form.ldapBindDn}
                onChange={(e) => set("ldapBindDn", e.currentTarget.value)}
              />
              <PasswordInput
                label={t("Bind password")}
                placeholder={
                  current?.hasLdapBindPassword
                    ? t("Leave empty to keep the current secret")
                    : undefined
                }
                value={form.ldapBindPassword}
                onChange={(e) => set("ldapBindPassword", e.currentTarget.value)}
                autoComplete="new-password"
              />
            </SimpleGrid>
            <TextInput
              label={t("Base DN")}
              placeholder="ou=people,dc=example,dc=com"
              value={form.ldapBaseDn}
              onChange={(e) => set("ldapBaseDn", e.currentTarget.value)}
              required
            />
            <TextInput
              label={t("User search filter")}
              description={t(
                "{{username}} is replaced with what the user types.",
                { username: "{{username}}" },
              )}
              placeholder="(sAMAccountName={{username}})"
              value={form.ldapUserSearchFilter}
              onChange={(e) =>
                set("ldapUserSearchFilter", e.currentTarget.value)
              }
              required
            />
            <SimpleGrid cols={{ base: 1, sm: 3 }}>
              <TextInput
                label={t("Email attribute")}
                placeholder="mail"
                value={form.ldapEmailAttribute}
                onChange={(e) =>
                  set("ldapEmailAttribute", e.currentTarget.value)
                }
              />
              <TextInput
                label={t("Name attribute")}
                placeholder="cn"
                value={form.ldapNameAttribute}
                onChange={(e) =>
                  set("ldapNameAttribute", e.currentTarget.value)
                }
              />
              <TextInput
                label={t("Groups attribute")}
                placeholder="memberOf"
                value={form.ldapGroupsAttribute}
                onChange={(e) =>
                  set("ldapGroupsAttribute", e.currentTarget.value)
                }
              />
            </SimpleGrid>
            <Switch
              label={t("Use StartTLS")}
              description={t("For ldap:// URLs. ldaps:// always uses TLS.")}
              checked={form.ldapTlsEnabled}
              onChange={(e) => set("ldapTlsEnabled", e.currentTarget.checked)}
            />
            <Textarea
              label={t("CA certificate")}
              description={t(
                "Optional. Trust a private certificate authority for TLS.",
              )}
              placeholder="-----BEGIN CERTIFICATE-----"
              autosize
              minRows={2}
              maxRows={6}
              styles={{ input: { fontFamily: "monospace", fontSize: 12 } }}
              value={form.ldapTlsCaCert}
              onChange={(e) => set("ldapTlsCaCert", e.currentTarget.value)}
            />
          </>
        )}

        {type !== "ldap" &&
          (current ? (
            <>
              <CopyField
                label={type === "saml" ? t("ACS URL") : t("Callback URL")}
                description={
                  type === "saml"
                    ? t("Where your identity provider sends the SAML response.")
                    : t(
                        "Register this redirect URI with your identity provider.",
                      )
                }
                value={current.callbackUrl}
              />
              {type === "saml" && current.samlEntityId && (
                <CopyField
                  label={t("Entity ID / metadata URL")}
                  value={current.samlEntityId}
                />
              )}
            </>
          ) : (
            <Text size="sm" c="dimmed">
              {t("The callback URL is shown after the provider is created.")}
            </Text>
          ))}

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
