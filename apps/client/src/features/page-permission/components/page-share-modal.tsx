import { useState } from "react";
import { Button, Indicator, Modal, Tabs } from "@mantine/core";
import { useDisclosure } from "@mantine/hooks";
import { IconLock, IconWorld } from "@tabler/icons-react";
import { useParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { extractPageSlugId } from "@/lib";
import { usePageQuery } from "@/features/page/queries/page-query.ts";
import { useShareForPageQuery } from "@/features/share/queries/share-query.ts";
import { SharePublishPanel } from "@/features/share/components/share-publish-panel.tsx";
import { PageAccessTab } from "@/features/page-permission/components/page-access-tab";

interface PageShareModalProps {
  readOnly?: boolean;
}

// The page "Share" button: who can access the page, and its public link.
export function PageShareModal({ readOnly }: PageShareModalProps) {
  const { t } = useTranslation();
  const { pageSlug } = useParams();
  const [opened, { open, close }] = useDisclosure(false);
  const { data: page } = usePageQuery({ pageId: extractPageSlugId(pageSlug) });
  const { data: share } = useShareForPageQuery(page?.id);
  const isRestricted = page?.permissions?.hasRestriction ?? false;
  const [tab, setTab] = useState<string | null>("access");

  return (
    <>
      <Button
        style={{ border: "none" }}
        size="compact-sm"
        variant="default"
        leftSection={
          isRestricted ? (
            <Indicator color="red" offset={5} withBorder>
              <IconLock size={20} stroke={1.5} />
            </Indicator>
          ) : share ? (
            <Indicator color="green" offset={5} withBorder>
              <IconWorld size={20} stroke={1.5} />
            </Indicator>
          ) : null
        }
        onClick={() => {
          setTab(share ? "publish" : "access");
          open();
        }}
      >
        {t("Share")}
      </Button>

      <Modal
        opened={opened}
        onClose={close}
        title={t("Share")}
        size={600}
        closeButtonProps={{ "aria-label": t("Close") }}
      >
        <Tabs value={tab} onChange={setTab} color="dark">
          <Tabs.List mb="md">
            <Tabs.Tab value="access">{t("Access")}</Tabs.Tab>
            <Tabs.Tab
              value="publish"
              rightSection={
                share ? <Indicator color="green" size={8} processing /> : null
              }
            >
              {t("Publish")}
            </Tabs.Tab>
          </Tabs.List>

          <Tabs.Panel value="access">
            {opened && <PageAccessTab pageId={page?.id} />}
          </Tabs.Panel>
          <Tabs.Panel value="publish">
            <SharePublishPanel
              pageId={page?.id}
              readOnly={readOnly}
              isRestricted={isRestricted}
            />
          </Tabs.Panel>
        </Tabs>
      </Modal>
    </>
  );
}
