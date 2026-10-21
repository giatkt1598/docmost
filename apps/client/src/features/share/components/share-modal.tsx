import { Button, Indicator, Popover } from "@mantine/core";
import { IconWorld } from "@tabler/icons-react";
import React from "react";
import { useParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { useShareForPageQuery } from "@/features/share/queries/share-query.ts";
import { extractPageSlugId } from "@/lib";
import { usePageQuery } from "@/features/page/queries/page-query.ts";
import { SharePublishPanel } from "@/features/share/components/share-publish-panel.tsx";

interface ShareModalProps {
  readOnly: boolean;
}
export default function ShareModal({ readOnly }: ShareModalProps) {
  const { t } = useTranslation();
  const { pageSlug } = useParams();
  const pageSlugId = extractPageSlugId(pageSlug);
  const { data: page } = usePageQuery({ pageId: pageSlugId });
  const pageId = page?.id;
  const { data: share } = useShareForPageQuery(pageId);

  return (
    <Popover width={350} position="bottom" withArrow shadow="md">
      <Popover.Target>
        <Button
          size="compact-sm"
          leftSection={
            <Indicator color="green" offset={5} disabled={!share} withBorder>
              <IconWorld size={20} stroke={1.5} />
            </Indicator>
          }
          color="dark"
          variant="subtle"
        >
          {t("Share")}
        </Button>
      </Popover.Target>
      <Popover.Dropdown style={{ userSelect: "none" }}>
        <SharePublishPanel
          pageId={pageId}
          readOnly={readOnly}
          isRestricted={page?.permissions?.hasRestriction}
        />
      </Popover.Dropdown>
    </Popover>
  );
}
