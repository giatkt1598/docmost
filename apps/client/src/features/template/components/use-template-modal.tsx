import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { DestinationPickerModal } from "@/components/ui/destination-picker/destination-picker-modal";
import { DestinationSelection } from "@/components/ui/destination-picker/destination-picker.types";
import { buildPageUrl } from "@/features/page/page.utils.ts";
import { useCreatePageFromTemplateMutation } from "@/features/template/queries/template-query";
import { ITemplate } from "@/features/template/types/template.types";

interface UseTemplateModalProps {
  template: ITemplate | null;
  onClose: () => void;
  initialSpaceId?: string;
}

// Picks where the new page goes, creates it from the template and opens it.
export function UseTemplateModal({
  template,
  onClose,
  initialSpaceId,
}: UseTemplateModalProps) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const createPageMutation = useCreatePageFromTemplateMutation();

  const handleSelect = async (selection: DestinationSelection) => {
    if (!template) return;
    const page = await createPageMutation.mutateAsync({
      templateId: template.id,
      spaceId: selection.spaceId,
      parentPageId: selection.type === "page" ? selection.pageId : undefined,
    });
    onClose();
    navigate(
      buildPageUrl(selection.space?.slug, page.slugId, page.title ?? undefined),
    );
  };

  return (
    <DestinationPickerModal
      opened={!!template}
      onClose={onClose}
      title={t("Choose where to create the page")}
      actionLabel={t("Create page")}
      onSelect={handleSelect}
      loading={createPageMutation.isPending}
      initialSpaceId={template?.spaceId ?? initialSpaceId}
    />
  );
}
