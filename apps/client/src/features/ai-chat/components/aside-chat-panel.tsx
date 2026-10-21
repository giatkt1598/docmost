import { useState } from "react";
import { ActionIcon, Group, Stack, Title, Tooltip } from "@mantine/core";
import { IconArrowsMaximize, IconPlus, IconX } from "@tabler/icons-react";
import { useSetAtom } from "jotai";
import { Link, useParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { asideStateAtom } from "@/components/layouts/global/hooks/atoms/sidebar-atom.ts";
import { extractPageSlugId } from "@/lib";
import { usePageQuery } from "@/features/page/queries/page-query.ts";
import { AiChatView } from "@/features/ai-chat/components/ai-chat-view";

// AI chat beside a page; the assistant knows which page is open.
export function AsideChatPanel() {
  const { t } = useTranslation();
  const setAside = useSetAtom(asideStateAtom);
  const { pageSlug } = useParams();
  const { data: page } = usePageQuery({ pageId: extractPageSlugId(pageSlug) });
  const [chatId, setChatId] = useState<string | undefined>();
  // a new key resets the view for a fresh chat
  const [session, setSession] = useState(0);

  return (
    <Stack gap="xs" h="100%" style={{ minHeight: 0 }}>
      <Group justify="space-between" wrap="nowrap">
        <Title order={2} size="h6" fw={500}>
          {t("AI Chat")}
        </Title>
        <Group gap={4} wrap="nowrap">
          <Tooltip label={t("New chat")}>
            <ActionIcon
              variant="subtle"
              color="gray"
              onClick={() => {
                setChatId(undefined);
                setSession((s) => s + 1);
              }}
              aria-label={t("New chat")}
            >
              <IconPlus size={18} />
            </ActionIcon>
          </Tooltip>
          {chatId && (
            <Tooltip label={t("Open in full view")}>
              <ActionIcon
                variant="subtle"
                color="gray"
                component={Link}
                to={`/ai/chat/${chatId}`}
                aria-label={t("Open in full view")}
              >
                <IconArrowsMaximize size={18} />
              </ActionIcon>
            </Tooltip>
          )}
          <Tooltip label={t("Close")}>
            <ActionIcon
              variant="subtle"
              color="gray"
              onClick={() => setAside((s) => ({ ...s, isAsideOpen: false }))}
              aria-label={t("Close")}
            >
              <IconX size={18} />
            </ActionIcon>
          </Tooltip>
        </Group>
      </Group>
      <div style={{ flex: 1, minHeight: 0 }}>
        <AiChatView
          key={session}
          chatId={chatId}
          pageId={page?.id}
          onChatCreated={(chat) => setChatId(chat.id)}
          compact
        />
      </div>
    </Stack>
  );
}

export default AsideChatPanel;
