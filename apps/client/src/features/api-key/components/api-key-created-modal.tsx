import {
  Alert,
  Button,
  Code,
  Group,
  Modal,
  Stack,
  Text,
  TextInput,
} from "@mantine/core";
import { IconAlertTriangle } from "@tabler/icons-react";
import { useTranslation } from "react-i18next";
import CopyTextButton from "@/components/common/copy.tsx";
import { getAppUrl } from "@/lib/config.ts";
import { ICreatedApiKey } from "@/features/api-key/types/api-key.types";

interface ApiKeyCreatedModalProps {
  apiKey: ICreatedApiKey | null;
  onClose: () => void;
}

export function ApiKeyCreatedModal({
  apiKey,
  onClose,
}: ApiKeyCreatedModalProps) {
  const { t } = useTranslation();
  const example = `curl -X POST -H "Authorization: Bearer ${apiKey?.token ?? ""}" ${getAppUrl()}/api/users/me`;

  return (
    <Modal
      opened={!!apiKey}
      onClose={onClose}
      title={t("API key created")}
      size="lg"
      closeOnClickOutside={false}
    >
      <Stack>
        <Alert
          variant="light"
          color="yellow"
          icon={<IconAlertTriangle size={18} />}
        >
          {t(
            "Copy the key now. It is shown only once and cannot be retrieved later.",
          )}
        </Alert>
        <TextInput
          label={apiKey?.name}
          value={apiKey?.token ?? ""}
          readOnly
          styles={{ input: { fontFamily: "monospace" } }}
          rightSection={<CopyTextButton text={apiKey?.token} />}
        />
        <div>
          <Text size="sm" fw={500} mb={4}>
            {t("Example")}
          </Text>
          <Code
            block
            style={{ whiteSpace: "pre-wrap", wordBreak: "break-all" }}
          >
            {example}
          </Code>
        </div>
        <Group justify="flex-end">
          <Button onClick={onClose}>{t("Done")}</Button>
        </Group>
      </Stack>
    </Modal>
  );
}
