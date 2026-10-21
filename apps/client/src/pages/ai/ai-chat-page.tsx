import { Container, Text } from "@mantine/core";
import { useAtomValue } from "jotai";
import { useLocation, useNavigate, useParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { DocumentTitle } from "@/components/ui/document-title.tsx";
import { workspaceAtom } from "@/features/user/atoms/current-user-atom.ts";
import { AiChatView } from "@/features/ai-chat/components/ai-chat-view";

// /ai and /ai/chat/:chatId
export default function AiChatPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { chatId } = useParams();
  const location = useLocation();
  const workspace = useAtomValue(workspaceAtom);
  // a question typed on the home page
  const initialMessage = (location.state as { initialContent?: string } | null)
    ?.initialContent;

  if (workspace && workspace.settings?.ai?.chat !== true) {
    return (
      <Text c="dimmed" ta="center" py="xl">
        {t("AI chat is turned off for this workspace.")}
      </Text>
    );
  }

  return (
    <Container size={820} h="calc(100dvh - 60px)" py="md">
      <DocumentTitle title={t("AI Chat")} />
      <AiChatView
        chatId={chatId}
        initialMessage={chatId ? undefined : initialMessage}
        onChatCreated={(chat) =>
          navigate(`/ai/chat/${chat.id}`, { replace: true, state: null })
        }
      />
    </Container>
  );
}
