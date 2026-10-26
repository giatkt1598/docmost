import { NodeViewWrapper, NodeViewProps } from "@tiptap/react";
import { ActionIcon, Box, Menu, Text } from "@mantine/core";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { BaseWorkspace } from "@/features/base/components/shell/base-workspace";
import { useBaseInfoQuery } from "@/features/base/queries/base-query";
import { BaseGridSkeleton } from "@/features/base/components/common/base-grid-skeleton";
import { IconDots, IconLink, IconTable, IconX } from "@tabler/icons-react";
import { notifications } from "@mantine/notifications";
import { usePageQuery } from "@/features/page/queries/page-query";
import { useClipboard } from "@/hooks/use-clipboard";
import { getAppUrl } from "@/lib/config.ts";
import { buildPageUrl } from "@/features/page/page.utils.ts";
import classes from "./base-embed.module.css";
import { usePublicBaseAccess } from "@/features/base-public/public-base-context";
import { PublicBaseView } from "@/features/base-public/components/public-base-view";

export function BaseEmbedView(props: NodeViewProps) {
  const publicAccess = usePublicBaseAccess();
  const pageId = props.node.attrs.pageId as string | null;
  if (publicAccess) {
    return (
      <NodeViewWrapper>
        {pageId && <PublicBaseView pageId={pageId} access={publicAccess} />}
      </NodeViewWrapper>
    );
  }
  return <AppBaseEmbedView {...props} />;
}

function AppBaseEmbedView({ node, editor, deleteNode }: NodeViewProps) {
  const { t } = useTranslation();
  const pageId = node.attrs.pageId as string | null;
  const pendingKey = node.attrs.pendingKey as string | null;
  const [menuOpen, setMenuOpen] = useState(false);
  // Suppress the query while the slash command awaits the server-assigned
  // pageId.
  const {
    data: base,
    isLoading,
    isError,
  } = useBaseInfoQuery(pendingKey ? undefined : (pageId ?? undefined));
  const { data: page } = usePageQuery({ pageId: pageId ?? undefined });
  const clipboard = useClipboard({ timeout: 500 });

  const handleCopyLink = () => {
    clipboard.copy(
      getAppUrl() + buildPageUrl(page.space?.slug, page.slugId, page.title),
    );
    notifications.show({ message: t("Link copied") });
  };

  // Error/invalid states render a compact message, not a tall reserved box.
  // The 200px min-height (which avoids a layout jump when the real table
  // mounts) is reserved only for the skeleton/loading/table states.
  const isCompact = !pendingKey && (!pageId || isError);

  const showControls = editor.isEditable && !pendingKey;

  let content: React.ReactNode;
  if (pendingKey) {
    // Slash command inserted the embed and is awaiting the server's
    // assigned pageId. Match the shape the create endpoint will
    // return for an inline-embed (Title + Text 1 + Text 2, one
    // empty row — see BaseService.create's `defaults`) so the swap
    // to the real table doesn't visibly collapse a large fake table
    // down to a small empty one.
    content = <BaseGridSkeleton rows={1} columns={3} />;
  } else if (!pageId) {
    content = (
      <Box p="md">
        <Text c="red">Invalid base embed (missing page id)</Text>
      </Box>
    );
  } else if (isLoading) {
    content = (
      <Box p="md">
        <Text c="dimmed">Loading...</Text>
      </Box>
    );
  } else if (isError) {
    content = (
      <Box p="md" bg="gray.0" style={{ borderRadius: 8 }}>
        <Text c="dimmed">{t("You don't have access to this base.")}</Text>
      </Box>
    );
  } else {
    content = (
      <BaseWorkspace
        pageId={pageId}
        embedded
        editable={editor.isEditable && (base?.permissions?.canEdit ?? false)}
      />
    );
  }

  return (
    <NodeViewWrapper
      className={classes.handleGutter}
      data-menu-open={menuOpen ? "true" : "false"}
    >
      {showControls && (
        <div
          className={classes.controls}
          contentEditable={false}
          onMouseDown={(e) => e.preventDefault()}
        >
          <Menu position="bottom-end" withinPortal onChange={setMenuOpen}>
            <Menu.Target>
              <ActionIcon
                variant="default"
                size="sm"
                aria-label={t("Base options")}
              >
                <IconDots size={16} />
              </ActionIcon>
            </Menu.Target>
            <Menu.Dropdown>
              <Menu.Item
                leftSection={<IconLink size={14} />}
                disabled={!page}
                onClick={handleCopyLink}
              >
                {t("Copy link")}
              </Menu.Item>
              <Menu.Item
                leftSection={<IconX size={14} />}
                onClick={() => deleteNode()}
              >
                {t("Remove from page")}
              </Menu.Item>
            </Menu.Dropdown>
          </Menu>
        </div>
      )}
      <div data-drag-preview hidden className={classes.dragPreview}>
        <IconTable size={16} />
        <span>{page?.title?.trim() || "Untitled base"}</span>
      </div>
      {/* exactly the editor's text column; the table and the board scroll
          inside it instead of widening it */}
      <div
        style={{
          minHeight: isCompact ? undefined : 200,
          minWidth: 0,
          maxWidth: "100%",
          overflow: "hidden",
        }}
      >
        {content}
      </div>
    </NodeViewWrapper>
  );
}
