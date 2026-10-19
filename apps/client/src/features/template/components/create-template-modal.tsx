import { useEffect, useState } from "react";
import { Button, Group, Modal, Stack, TextInput } from "@mantine/core";
import { notifications } from "@mantine/notifications";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import useUserRole from "@/hooks/use-user-role.tsx";
import { useCreateTemplateMutation } from "@/features/template/queries/template-query";
import {
  GLOBAL_SCOPE,
  TemplateScopeSelect,
} from "@/features/template/components/template-scope-select";

interface CreateTemplateModalProps {
  opened: boolean;
  onClose: () => void;
  // Save as template: the page whose title, icon and content are copied
  sourcePageId?: string;
  defaultTitle?: string;
  defaultSpaceId?: string;
}

export function CreateTemplateModal({
  opened,
  onClose,
  sourcePageId,
  defaultTitle,
  defaultSpaceId,
}: CreateTemplateModalProps) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { isAdmin } = useUserRole();
  const createMutation = useCreateTemplateMutation();
  const [title, setTitle] = useState("");
  const [scope, setScope] = useState<string | null>(null);

  useEffect(() => {
    if (!opened) return;
    setTitle(defaultTitle ?? "");
    setScope(defaultSpaceId ?? (isAdmin ? GLOBAL_SCOPE : null));
  }, [opened, defaultTitle, defaultSpaceId, isAdmin]);

  const canSubmit = scope !== null && (isAdmin || scope !== GLOBAL_SCOPE);

  const handleCreate = async () => {
    const template = await createMutation.mutateAsync({
      title: title.trim() || undefined,
      spaceId: scope === GLOBAL_SCOPE ? null : scope,
      sourcePageId,
    });
    onClose();
    if (sourcePageId) {
      notifications.show({ message: t("Template created") });
    }
    navigate(`/templates/${template.id}`);
  };

  return (
    <Modal
      opened={opened}
      onClose={onClose}
      title={sourcePageId ? t("Save as template") : t("New template")}
    >
      <Stack>
        <TextInput
          label={t("Title")}
          placeholder={t("Untitled")}
          value={title}
          onChange={(e) => setTitle(e.currentTarget.value)}
          data-autofocus
        />
        <TemplateScopeSelect value={scope} onChange={setScope} />
        <Group justify="flex-end" mt="sm">
          <Button variant="default" onClick={onClose}>
            {t("Cancel")}
          </Button>
          <Button
            onClick={handleCreate}
            disabled={!canSubmit}
            loading={createMutation.isPending}
          >
            {t("Create")}
          </Button>
        </Group>
      </Stack>
    </Modal>
  );
}
