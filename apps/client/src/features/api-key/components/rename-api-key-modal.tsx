import { useEffect, useState } from "react";
import { Button, Group, Modal, Stack, TextInput } from "@mantine/core";
import { useTranslation } from "react-i18next";
import { useRenameApiKeyMutation } from "@/features/api-key/queries/api-key-query";
import { IApiKey } from "@/features/api-key/types/api-key.types";

interface RenameApiKeyModalProps {
  apiKey: IApiKey | null;
  onClose: () => void;
}

export function RenameApiKeyModal({ apiKey, onClose }: RenameApiKeyModalProps) {
  const { t } = useTranslation();
  const rename = useRenameApiKeyMutation();
  const [name, setName] = useState("");

  useEffect(() => {
    setName(apiKey?.name ?? "");
  }, [apiKey]);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!apiKey || !name.trim()) return;
    await rename.mutateAsync({ apiKeyId: apiKey.id, name: name.trim() });
    onClose();
  };

  return (
    <Modal opened={!!apiKey} onClose={onClose} title={t("Rename API key")}>
      <form onSubmit={onSubmit}>
        <Stack>
          <TextInput
            label={t("Name")}
            value={name}
            onChange={(e) => setName(e.currentTarget.value)}
            maxLength={100}
            data-autofocus
            required
          />
          <Group justify="flex-end">
            <Button variant="default" onClick={onClose}>
              {t("Cancel")}
            </Button>
            <Button
              type="submit"
              disabled={!name.trim()}
              loading={rename.isPending}
            >
              {t("Save")}
            </Button>
          </Group>
        </Stack>
      </form>
    </Modal>
  );
}
