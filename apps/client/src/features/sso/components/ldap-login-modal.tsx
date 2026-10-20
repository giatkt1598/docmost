import { useState } from "react";
import { Button, Modal, PasswordInput, Stack, TextInput } from "@mantine/core";
import { notifications } from "@mantine/notifications";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import APP_ROUTE, { getPostLoginRedirect } from "@/lib/app-route.ts";
import { ldapLogin } from "@/features/sso/services/sso-service";
import { IPublicAuthProvider } from "@/features/sso/types/sso.types";

interface LdapLoginModalProps {
  provider: IPublicAuthProvider | null;
  onClose: () => void;
}

export function LdapLoginModal({ provider, onClose }: LdapLoginModalProps) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!provider) return;
    setLoading(true);
    try {
      const response = await ldapLogin(provider.id, { username, password });
      // same two-factor hand-off as the password login
      if (response?.userHasMfa) {
        navigate(APP_ROUTE.AUTH.MFA_CHALLENGE + window.location.search);
      } else if (response?.requiresMfaSetup) {
        navigate(APP_ROUTE.AUTH.MFA_SETUP_REQUIRED + window.location.search);
      } else {
        window.location.href = getPostLoginRedirect();
      }
    } catch (err: any) {
      notifications.show({
        message: err?.response?.data?.message ?? t("Sign-in failed"),
        color: "red",
      });
      setLoading(false);
    }
  };

  return (
    <Modal
      opened={!!provider}
      onClose={onClose}
      title={t("Sign in with {{name}}", { name: provider?.name ?? "" })}
    >
      <form onSubmit={onSubmit}>
        <Stack>
          <TextInput
            label={t("Username")}
            value={username}
            onChange={(e) => setUsername(e.currentTarget.value)}
            autoComplete="username"
            data-autofocus
            required
          />
          <PasswordInput
            label={t("Password")}
            value={password}
            onChange={(e) => setPassword(e.currentTarget.value)}
            autoComplete="current-password"
            required
          />
          <Button type="submit" fullWidth loading={loading}>
            {t("Sign In")}
          </Button>
        </Stack>
      </form>
    </Modal>
  );
}
