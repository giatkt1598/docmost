import { Anchor, Box, Container, Stack, Text, Title } from "@mantine/core";
import { Link, useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { AuthLayout } from "@/features/auth/components/auth-layout.tsx";
import classes from "@/features/auth/components/auth.module.css";
import { DocumentTitle } from "@/components/ui/document-title.tsx";
import APP_ROUTE, { getPostLoginRedirect } from "@/lib/app-route.ts";
import { TwoFactorSetupFlow } from "@/features/two-factor/components/two-factor-setup-flow";
import {
  enableRequiredTwoFactor,
  startRequiredTwoFactorSetup,
} from "@/features/two-factor/services/two-factor-service";

// Shown after the password step when the workspace enforces 2FA and the
// user has not set it up yet.
export default function TwoFactorSetupRequired() {
  const { t } = useTranslation();
  const navigate = useNavigate();

  return (
    <AuthLayout>
      <DocumentTitle title={t("Set up two-factor authentication")} />
      <Container size={460} className={classes.container}>
        <Box p="xl" className={classes.containerBox}>
          <Title order={1} size="h2" ta="center" fw={500} mb="xs">
            {t("Two-factor authentication required")}
          </Title>
          <Stack>
            <Text size="sm" c="dimmed" ta="center">
              {t(
                "Your workspace requires two-factor authentication. Please set it up to continue.",
              )}
            </Text>
            <TwoFactorSetupFlow
              start={startRequiredTwoFactorSetup}
              enable={enableRequiredTwoFactor}
              onDone={() => navigate(getPostLoginRedirect(), { replace: true })}
            />
            <Anchor component={Link} to={APP_ROUTE.AUTH.LOGIN} size="sm" ta="center">
              {t("Cancel and logout")}
            </Anchor>
          </Stack>
        </Box>
      </Container>
    </AuthLayout>
  );
}
