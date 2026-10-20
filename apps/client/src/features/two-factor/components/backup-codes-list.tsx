import { Button, Code, Group, SimpleGrid, Stack, Text } from "@mantine/core";
import { IconCopy, IconDownload } from "@tabler/icons-react";
import { useTranslation } from "react-i18next";
import { CopyButton } from "@/components/common/copy-button";

interface BackupCodesListProps {
  codes: string[];
}

export function BackupCodesList({ codes }: BackupCodesListProps) {
  const { t } = useTranslation();
  const text = codes.join("\n");

  const download = () => {
    const blob = new Blob([text + "\n"], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "docmost-backup-codes.txt";
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <Stack gap="sm">
      <Text size="sm" c="dimmed">
        {t(
          "These codes can be used to access your account if you lose access to your authenticator app. Each code can only be used once.",
        )}
      </Text>
      <SimpleGrid cols={2} spacing="xs">
        {codes.map((code) => (
          <Code key={code} ta="center" fz="sm">
            {code}
          </Code>
        ))}
      </SimpleGrid>
      <Group gap="xs">
        <CopyButton value={text}>
          {({ copied, copy }) => (
            <Button
              variant="default"
              size="xs"
              leftSection={<IconCopy size={14} />}
              onClick={copy}
            >
              {copied ? t("Copied") : t("Copy")}
            </Button>
          )}
        </CopyButton>
        <Button
          variant="default"
          size="xs"
          leftSection={<IconDownload size={14} />}
          onClick={download}
        >
          {t("Download")}
        </Button>
      </Group>
    </Stack>
  );
}
