import { useEffect, useState } from "react";
import { Button, Group, Stack, TagsInput, Text } from "@mantine/core";
import { useTranslation } from "react-i18next";
import { useUpdateWorkspaceSetting } from "@/features/security/hooks/use-update-workspace-setting";

export function AllowedDomains() {
  const { t } = useTranslation();
  const { workspace, save, saving } = useUpdateWorkspaceSetting();
  const [domains, setDomains] = useState<string[]>([]);

  useEffect(() => {
    setDomains(workspace?.emailDomains ?? []);
  }, [workspace?.emailDomains]);

  const changed =
    JSON.stringify(domains) !== JSON.stringify(workspace?.emailDomains ?? []);

  return (
    <Stack gap="xs">
      <div>
        <Text size="md">{t("Allowed email domains")}</Text>
        <Text size="sm" c="dimmed">
          {t(
            "Only users with email addresses from these domains can join this workspace through invitations or SSO.",
          )}
        </Text>
      </div>
      <TagsInput
        value={domains}
        onChange={(values) =>
          setDomains(values.map((v) => v.trim().toLowerCase()).filter(Boolean))
        }
        placeholder={domains.length ? "" : t("e.g acme.com")}
        splitChars={[",", " "]}
        clearable
        aria-label={t("Allowed email domains")}
      />
      <Group justify="flex-end">
        <Button
          size="sm"
          disabled={!changed}
          loading={saving}
          onClick={() => save({ emailDomains: domains })}
        >
          {t("Save")}
        </Button>
      </Group>
    </Stack>
  );
}
