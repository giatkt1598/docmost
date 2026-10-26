import { useEffect, useRef } from "react";
import {
  Box,
  Button,
  Center,
  Loader,
  ScrollArea,
  Stack,
  Text,
  Title,
} from "@mantine/core";
import { IconSparkles } from "@tabler/icons-react";
import { useTranslation } from "react-i18next";
import { useAiChatSession } from "@/features/ai-chat/hooks/use-ai-chat-session";
import { ChatMessage } from "@/features/ai-chat/components/chat-message";
import { ChatInput } from "@/features/ai-chat/components/chat-input";
import {
  IAiChat,
  IChatSelection,
} from "@/features/ai-chat/types/ai-chat.types";

interface AiChatViewProps {
  chatId?: string;
  // the page being viewed, so "this page" works
  pageId?: string;
  onChatCreated?: (chat: IAiChat) => void;
  // sent once when a new chat opens, e.g. from the home prompt
  initialMessage?: string;
  compact?: boolean;
  getSelection?: () => IChatSelection | null;
}

export function AiChatView({
  chatId,
  pageId,
  onChatCreated,
  initialMessage,
  compact,
  getSelection,
}: AiChatViewProps) {
  const { t } = useTranslation();
  const session = useAiChatSession({
    chatId,
    pageId,
    onChatCreated,
    getSelection,
  });
  const viewportRef = useRef<HTMLDivElement>(null);
  const sentInitial = useRef(false);

  useEffect(() => {
    if (initialMessage && !chatId && !sentInitial.current) {
      sentInitial.current = true;
      session.send(initialMessage);
    }
  }, [initialMessage, chatId]);

  // keep the newest message in view while the reply streams in
  useEffect(() => {
    const viewport = viewportRef.current;
    if (viewport) viewport.scrollTo({ top: viewport.scrollHeight });
  }, [session.messages]);

  const suggestions = pageId
    ? [t("Summarize this page"), t("What are the key points of this page?")]
    : [t("What pages are there?"), t("Find the pages about onboarding")];

  return (
    <Stack gap="sm" h="100%" style={{ minHeight: 0 }}>
      <ScrollArea
        viewportRef={viewportRef}
        style={{ flex: 1 }}
        type="auto"
        offsetScrollbars
      >
        {session.loading ? (
          <Center py="xl">
            <Loader size="sm" />
          </Center>
        ) : session.messages.length === 0 ? (
          <Stack align="center" gap="xs" py={compact ? "md" : 60}>
            <IconSparkles size={28} />
            <Title order={compact ? 5 : 3} ta="center">
              {t("How can I help?")}
            </Title>
            <Text size="sm" c="dimmed" ta="center" maw={420}>
              {t(
                "I can search and read the pages you have access to and answer from them.",
              )}
            </Text>
            <Stack gap={6} mt="sm">
              {suggestions.map((s) => (
                <Button
                  key={s}
                  variant="default"
                  size="xs"
                  radius="xl"
                  onClick={() => session.send(s)}
                >
                  {s}
                </Button>
              ))}
            </Stack>
          </Stack>
        ) : (
          <Stack gap="lg" py="sm" px={compact ? 0 : "xs"}>
            {session.messages.map((message, i) => (
              <ChatMessage
                key={message.id ?? `pending-${i}`}
                message={message}
                compact={compact}
                streaming={
                  session.streaming && i === session.messages.length - 1
                }
              />
            ))}
          </Stack>
        )}
        {session.error && (
          <Text size="sm" c="red" ta="center">
            {session.error}
          </Text>
        )}
      </ScrollArea>

      <Box>
        <ChatInput
          onSend={session.send}
          onStop={session.stop}
          streaming={session.streaming}
          autoFocus={!compact}
        />
        <Text size="xs" c="dimmed" ta="center" mt={4}>
          {t("AI can make mistakes. Check the linked pages.")}
        </Text>
      </Box>
    </Stack>
  );
}
