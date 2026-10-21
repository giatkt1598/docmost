import {
  Group,
  List,
  Paper,
  SimpleGrid,
  Stack,
  Text,
  TextInput,
  ThemeIcon,
} from "@mantine/core";
import { IconCheck } from "@tabler/icons-react";
import { useAtomValue } from "jotai";
import { useTranslation } from "react-i18next";
import semverGt from "semver/functions/gt";
import SettingsTitle from "@/components/settings/settings-title.tsx";
import { DocumentTitle } from "@/components/ui/document-title.tsx";
import CopyTextButton from "@/components/common/copy.tsx";
import useUserRole from "@/hooks/use-user-role.tsx";
import { workspaceAtom } from "@/features/user/atoms/current-user-atom.ts";
import { useAppVersion } from "@/features/workspace/queries/workspace-query.ts";
import { EDITION_FEATURES } from "./features";

function InfoCard({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <Paper p="sm" radius="md" withBorder>
      <Text c="dimmed" tt="uppercase" fw={700} fz="xs">
        {label}
      </Text>
      {children}
    </Paper>
  );
}

function hasNewerVersion(current?: string, latest?: string) {
  try {
    return !!current && !!latest && semverGt(latest, current);
  } catch {
    return false;
  }
}

export default function SystemInformation() {
  const { t } = useTranslation();
  const { isAdmin } = useUserRole();
  const workspace = useAtomValue(workspaceAtom);
  const { data: version } = useAppVersion(isAdmin);

  if (!isAdmin) return null;

  const available = EDITION_FEATURES.filter((f) => f.available);
  const missing = EDITION_FEATURES.filter((f) => !f.available);
  const update = hasNewerVersion(
    version?.currentVersion,
    version?.latestVersion,
  );

  return (
    <>
      <DocumentTitle title={t("System Information")} />
      <SettingsTitle title={t("System Information")} />

      <SimpleGrid cols={{ base: 1, sm: 2 }} mb="xl">
        <InfoCard label={t("Workspace ID")}>
          <TextInput
            style={{ fontWeight: 700 }}
            variant="unstyled"
            readOnly
            value={workspace?.id ?? ""}
            rightSection={<CopyTextButton text={workspace?.id} />}
          />
        </InfoCard>
        <InfoCard label={t("Member count")}>
          <Text fw={700} fz="lg">
            {workspace?.memberCount}
          </Text>
        </InfoCard>
        <InfoCard label={t("Version")}>
          <Text fw={700} fz="lg">
            {version?.currentVersion ? `v${version.currentVersion}` : "—"}
          </Text>
          {update && (
            <Text size="xs" c="dimmed">
              {t("{{latestVersion}} is available", {
                latestVersion: `v${version.latestVersion}`,
              })}
            </Text>
          )}
        </InfoCard>
        <InfoCard label={t("Edition")}>
          <Text fw={700} fz="lg">
            {t("Open Source (customized)")}
          </Text>
        </InfoCard>
      </SimpleGrid>

      <Stack gap="xs">
        <Text fw={500}>{t("Features")}</Text>
        <Text size="sm" c="dimmed">
          {t("Green: available in this build. Gray: not implemented yet.")}
        </Text>
        <List spacing={6} size="sm" mt="xs">
          {[...available, ...missing].map((feature) => (
            <List.Item
              key={feature.label}
              icon={
                <ThemeIcon
                  size={20}
                  radius="xl"
                  color={feature.available ? "green" : "gray"}
                  variant={feature.available ? "filled" : "light"}
                >
                  <IconCheck size={14} />
                </ThemeIcon>
              }
            >
              <Group gap={6}>
                <Text size="sm" c={feature.available ? undefined : "dimmed"}>
                  {t(feature.label)}
                </Text>
              </Group>
            </List.Item>
          ))}
        </List>
      </Stack>
    </>
  );
}
