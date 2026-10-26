import { useCallback, useEffect, useRef, useState } from "react";
import {
  ActionIcon,
  Center,
  Group,
  Loader,
  Popover,
  ScrollArea,
  Stack,
  Text,
  Title,
  Tooltip,
  UnstyledButton,
} from "@mantine/core";
import {
  IconArrowsMaximize,
  IconHistory,
  IconPlus,
  IconX,
} from "@tabler/icons-react";
import { useAtomValue, useSetAtom } from "jotai";
import { pageEditorAtom } from "@/features/editor/atoms/editor-atoms.ts";
import { Link, useParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { asideStateAtom } from "@/components/layouts/global/hooks/atoms/sidebar-atom.ts";
import { extractPageSlugId } from "@/lib";
import { timeAgo } from "@/lib/time.ts";
import { usePageQuery } from "@/features/page/queries/page-query.ts";
import { AiChatView } from "@/features/ai-chat/components/ai-chat-view";
import { useAiChatsQuery } from "@/features/ai-chat/queries/ai-chat-query";
import {
  IAiChat,
  IChatSelection,
} from "@/features/ai-chat/types/ai-chat.types";

// The user's earlier chats beside this page.
function ChatHistory({
  chats,
  activeId,
  onPick,
}: {
  chats: IAiChat[];
  activeId?: string;
  onPick: (chat: IAiChat) => void;
}) {
  const { t } = useTranslation();
  const [opened, setOpened] = useState(false);

  return (
    <Popover
      opened={opened}
      onChange={setOpened}
      position="bottom-end"
      width={280}
      shadow="md"
      withinPortal
    >
      <Popover.Target>
        <Tooltip label={t("Chat history")} disabled={opened}>
          <ActionIcon
            variant="subtle"
            color="gray"
            onClick={() => setOpened((o) => !o)}
            aria-label={t("Chat history")}
          >
            <IconHistory size={18} />
          </ActionIcon>
        </Tooltip>
      </Popover.Target>
      <Popover.Dropdown p={4}>
        {chats.length === 0 ? (
          <Text size="sm" c="dimmed" ta="center" py="sm">
            {t("No chats yet")}
          </Text>
        ) : (
          <ScrollArea.Autosize mah={320} type="auto">
            <Stack gap={2}>
              {chats.map((chat) => (
                <UnstyledButton
                  key={chat.id}
                  onClick={() => {
                    setOpened(false);
                    onPick(chat);
                  }}
                  px="xs"
                  py={6}
                  style={{
                    borderRadius: "var(--mantine-radius-sm)",
                    background:
                      chat.id === activeId
                        ? "light-dark(var(--mantine-color-gray-1), var(--mantine-color-dark-5))"
                        : undefined,
                  }}
                >
                  <Text size="sm" lineClamp={1}>
                    {chat.title || t("New chat")}
                  </Text>
                  <Text size="xs" c="dimmed">
                    {timeAgo(new Date(chat.updatedAt))}
                  </Text>
                </UnstyledButton>
              ))}
            </Stack>
          </ScrollArea.Autosize>
        )}
      </Popover.Dropdown>
    </Popover>
  );
}

// AI chat beside a page; the assistant knows which page is open. Opens on
// the user's latest chat about this page, with the earlier ones in History.
export function AsideChatPanel() {
  const { t } = useTranslation();
  const setAside = useSetAtom(asideStateAtom);
  const editor = useAtomValue(pageEditorAtom);
  const { pageSlug } = useParams();
  const { data: page } = usePageQuery({ pageId: extractPageSlugId(pageSlug) });
  const pageId = page?.id;
  const { data: chats } = useAiChatsQuery("", pageId, !!pageId);

  const [chatId, setChatId] = useState<string | undefined>();
  // a new key resets the view for another chat
  const [session, setSession] = useState(0);
  // the page whose latest chat was opened
  const openedFor = useRef<string | undefined>(undefined);

  useEffect(() => {
    if (!pageId || !chats || openedFor.current === pageId) return;
    openedFor.current = pageId;
    setChatId(chats[0]?.id);
    setSession((s) => s + 1);
  }, [pageId, chats]);

  const open = (id?: string) => {
    setChatId(id);
    setSession((s) => s + 1);
  };

  const ready = !!pageId && openedFor.current === pageId;

  // the selection in the page editor and the blocks it spans, read when a
  // message is sent (the editor keeps it while focus is in the chat)
  const getSelection = useCallback((): IChatSelection | null => {
    if (!editor || editor.isDestroyed) return null;
    const { from, to, empty } = editor.state.selection;
    if (empty) return null;
    const text = editor.state.doc.textBetween(from, to, "\n").trim();
    if (!text) return null;
    const blockIds = new Set<string>();
    editor.state.doc.nodesBetween(from, to, (node) => {
      if (node.isBlock && node.attrs?.id) blockIds.add(node.attrs.id);
    });
    return { text, blockIds: [...blockIds] };
  }, [editor]);

  return (
    <Stack gap={0} h="100%" style={{ minHeight: 0 }}>
      <Group justify="space-between" wrap="nowrap" px="sm" py="xs">
        <Title order={2} size="h6" fw={500}>
          {t("AI Chat")}
        </Title>
        <Group gap={4} wrap="nowrap">
          <ChatHistory
            chats={chats ?? []}
            activeId={chatId}
            onPick={(chat) => open(chat.id)}
          />
          <Tooltip label={t("New chat")}>
            <ActionIcon
              variant="subtle"
              color="gray"
              onClick={() => open(undefined)}
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
      <div
        style={{
          flex: 1,
          minHeight: 0,
          padding: "0 var(--mantine-spacing-sm) var(--mantine-spacing-sm)",
        }}
      >
        {ready ? (
          <AiChatView
            key={session}
            chatId={chatId}
            pageId={pageId}
            onChatCreated={(chat) => setChatId(chat.id)}
            getSelection={getSelection}
            compact
          />
        ) : (
          <Center h="100%">
            <Loader size="sm" />
          </Center>
        )}
      </div>
    </Stack>
  );
}

export default AsideChatPanel;
