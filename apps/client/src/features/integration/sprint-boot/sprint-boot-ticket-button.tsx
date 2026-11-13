import { useEffect } from "react";
import { ActionIcon, Tooltip } from "@mantine/core";
import type { Editor } from "@tiptap/react";
import { useParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { SprintBootIcon } from "@/components/icons";
import { usePageQuery } from "@/features/page/queries/page-query";
import { extractPageSlugId } from "@/lib";
import { useInstalledIntegrations } from "../queries/integration-query";
import { openCreateTicketModal } from "./sprint-boot-modals";
import { setSprintBootInstalled, SPRINT_BOOT_TYPE } from "./sprint-boot-service";

// Bubble menu action: the selected text becomes a Sprint Boot ticket, like Confluence's "Create Jira issue".
export function SprintBootTicketButton({ editor }: { editor: Editor }) {
  const { t } = useTranslation();
  const { pageSlug } = useParams();
  const { data: page } = usePageQuery({ pageId: pageSlug ? extractPageSlugId(pageSlug) : undefined });
  const { data: installed } = useInstalledIntegrations();
  const available = Boolean(installed?.some((item) => item.type === SPRINT_BOOT_TYPE));

  useEffect(() => setSprintBootInstalled(available), [available]);

  if (!available || !editor.isEditable) return null;

  return (
    <Tooltip label={t("Create Sprint Boot ticket")} withArrow withinPortal={false}>
      <ActionIcon
        variant="default"
        size="lg"
        radius="6px"
        aria-label={t("Create Sprint Boot ticket")}
        style={{ border: "none" }}
        onClick={() => openCreateTicketModal(editor, page?.spaceId)}
      >
        <SprintBootIcon size={16} />
      </ActionIcon>
    </Tooltip>
  );
}
