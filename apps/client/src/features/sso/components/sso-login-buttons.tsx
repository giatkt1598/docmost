import { useEffect, useState } from "react";
import { Alert, Anchor, Button, Divider, Stack, Text } from "@mantine/core";
import { IconBrandGoogle, IconKey, IconLock } from "@tabler/icons-react";
import { useSearchParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { useWorkspacePublicDataQuery } from "@/features/workspace/queries/workspace-query.ts";
import { getRedirectParam } from "@/lib/app-route.ts";
import { buildSsoLoginUrl } from "@/features/sso/services/sso-service";
import { IPublicAuthProvider } from "@/features/sso/types/sso.types";
import { LdapLoginModal } from "@/features/sso/components/ldap-login-modal";

interface SsoLoginButtonsProps {
  // whether the password form is currently shown below the buttons
  showPasswordForm: boolean;
  // reveals the password form while SSO is enforced (owner fallback)
  onUsePassword?: () => void;
}

// `?local=1` skips the automatic redirect so the owner can reach the password form.
export const LOCAL_LOGIN_PARAM = "local";

export function SsoLoginButtons({
  showPasswordForm,
  onUsePassword,
}: SsoLoginButtonsProps) {
  const { t } = useTranslation();
  const [searchParams] = useSearchParams();
  const { data } = useWorkspacePublicDataQuery();
  // the public endpoint only exposes id, name and type
  const providers = (data?.authProviders ??
    []) as unknown as IPublicAuthProvider[];
  const ssoError = searchParams.get("ssoError");
  const localLogin = searchParams.has(LOCAL_LOGIN_PARAM);
  const redirect = getRedirectParam();
  const [ldapProvider, setLdapProvider] = useState<IPublicAuthProvider | null>(
    null,
  );

  const autoRedirect =
    data?.enforceSso &&
    providers.length === 1 &&
    providers[0].type !== "ldap" &&
    !ssoError &&
    !localLogin;

  useEffect(() => {
    if (autoRedirect) {
      window.location.href = buildSsoLoginUrl(providers[0].id, redirect);
    }
  }, [autoRedirect]);

  if (autoRedirect) return null;

  return (
    <>
      {ssoError && (
        <Alert color="red" mb="md" title={t("Single sign-on failed")}>
          {ssoError}
        </Alert>
      )}

      {providers.length > 0 && (
        <Stack gap="sm">
          {providers.map((provider) => (
            <Button
              key={provider.id}
              {...(provider.type === "ldap"
                ? { onClick: () => setLdapProvider(provider) }
                : {
                    component: "a" as const,
                    href: buildSsoLoginUrl(provider.id, redirect),
                  })}
              variant="default"
              fullWidth
              leftSection={
                provider.type === "google" ? (
                  <IconBrandGoogle size={18} />
                ) : provider.type === "ldap" ? (
                  <IconLock size={18} />
                ) : (
                  <IconKey size={18} />
                )
              }
            >
              {t("Continue with {{name}}", { name: provider.name })}
            </Button>
          ))}
        </Stack>
      )}

      <LdapLoginModal
        provider={ldapProvider}
        onClose={() => setLdapProvider(null)}
      />

      {providers.length > 0 && showPasswordForm && (
        <Divider my="lg" label={t("or")} labelPosition="center" />
      )}

      {data?.enforceSso && !showPasswordForm && onUsePassword && (
        <Text size="xs" ta="center" mt="lg" c="dimmed">
          <Anchor
            component="button"
            type="button"
            size="xs"
            onClick={onUsePassword}
          >
            {t("Workspace owner? Sign in with email and password")}
          </Anchor>
        </Text>
      )}
    </>
  );
}
