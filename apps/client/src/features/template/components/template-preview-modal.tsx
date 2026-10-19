import { Button, Group, Loader, Modal, ScrollArea, Text } from "@mantine/core";
import { useTranslation } from "react-i18next";
import ReadonlyPageEditor from "@/features/editor/readonly-page-editor.tsx";
import { useTemplateQuery } from "@/features/template/queries/template-query";
import { ITemplate } from "@/features/template/types/template.types";

interface TemplatePreviewModalProps {
  templateId: string | null;
  onClose: () => void;
  onUse?: (template: ITemplate) => void;
}

export function TemplatePreviewModal({
  templateId,
  onClose,
  onUse,
}: TemplatePreviewModalProps) {
  const { t } = useTranslation();
  const { data: template, isLoading } = useTemplateQuery(
    templateId ?? undefined,
  );

  return (
    <Modal.Root size={1000} opened={!!templateId} onClose={onClose}>
      <Modal.Overlay />
      <Modal.Content style={{ overflow: "hidden" }}>
        <Modal.Header>
          <Modal.Title>
            <Text fw={500}>{t("Preview")}</Text>
          </Modal.Title>
          <Group gap="xs">
            {onUse && template && (
              <Button size="xs" onClick={() => onUse(template)}>
                {t("Use template")}
              </Button>
            )}
            <Modal.CloseButton aria-label={t("Close")} />
          </Group>
        </Modal.Header>
        <Modal.Body p={0}>
          <ScrollArea h={600} w="100%" scrollbarSize={5}>
            {isLoading || !template ? (
              <Group justify="center" p="xl">
                <Loader size="sm" />
              </Group>
            ) : (
              <ReadonlyPageEditor
                title={template.title ?? ""}
                content={template.content ?? ""}
              />
            )}
          </ScrollArea>
        </Modal.Body>
      </Modal.Content>
    </Modal.Root>
  );
}
