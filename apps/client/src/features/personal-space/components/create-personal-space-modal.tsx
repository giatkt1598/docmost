import { useEffect, useState } from "react";
import { Button, Group, Modal, Stack, Text, TextInput } from "@mantine/core";
import { notifications } from "@mantine/notifications";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { useAtomValue } from "jotai";
import { currentUserAtom } from "@/features/user/atoms/current-user-atom.ts";
import { getSpaceUrl } from "@/lib/config.ts";
import { useCreatePersonalSpaceMutation } from "@/features/personal-space/queries/personal-space-query";

interface CreatePersonalSpaceModalProps {
  opened: boolean;
  onClose: () => void;
}

export function CreatePersonalSpaceModal({
  opened,
  onClose,
}: CreatePersonalSpaceModalProps) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const currentUser = useAtomValue(currentUserAtom);
  const createMutation = useCreatePersonalSpaceMutation();
  const [name, setName] = useState("");

  useEffect(() => {
    if (!opened) return;
    const firstName = currentUser?.user?.name?.trim().split(/\s+/)[0];
    setName(firstName ? t("{{name}}'s space", { name: firstName }) : "");
  }, [opened]);

  const trimmed = name.trim();
  const valid = trimmed.length >= 2 && trimmed.length <= 100;

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!valid) return;
    try {
      const space = await createMutation.mutateAsync({ name: trimmed });
      onClose();
      navigate(getSpaceUrl(space.slug));
    } catch (err: any) {
      notifications.show({
        message: err?.response?.data?.message ?? err?.message,
        color: "red",
      });
    }
  };

  return (
    <Modal opened={opened} onClose={onClose} title={t("Create personal space")}>
      <form onSubmit={onSubmit}>
        <Stack>
          <Text size="sm" c="dimmed">
            {t("Only you can access your personal space.")}
          </Text>
          <TextInput
            label={t("Space name")}
            value={name}
            onChange={(e) => setName(e.currentTarget.value)}
            maxLength={100}
            data-autofocus
            required
          />
          <Group justify="flex-end">
            <Button
              type="submit"
              disabled={!valid}
              loading={createMutation.isPending}
            >
              {t("Create")}
            </Button>
          </Group>
        </Stack>
      </form>
    </Modal>
  );
}
