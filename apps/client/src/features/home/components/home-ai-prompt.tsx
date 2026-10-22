import { getAppName } from "@/lib/config.ts";
import { useAtomValue } from "jotai";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { workspaceAtom } from "@/features/user/atoms/current-user-atom.ts";
import { ChatInput } from "@/features/ai-chat/components/chat-input";
import classes from "./home-ai-prompt.module.css";

export type HomeAiPromptInitialState = {
  initialContent: string;
  // kept for the enterprise chat layout, which reads the same state
  initialMentions?: any[];
  initialAttachments?: any[];
};

export default function HomeAiPrompt() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const workspace = useAtomValue(workspaceAtom);

  const aiChatEnabled = workspace?.settings?.ai?.chat === true;
  if (!aiChatEnabled) return null;

  const handleSend = (content: string) => {
    if (!content.trim()) return;
    const state: HomeAiPromptInitialState = { initialContent: content };
    navigate("/ai", { state });
  };

  return (
    <div className={classes.wrapper}>
      <h1 className={classes.heading}>
        {t("Welcome to {{name}}", { name: workspace?.name ?? getAppName() })}
      </h1>
      <div className={classes.subtitle}>
        {t("Ask anything or search your workspace")}
      </div>

      <div className={classes.inputContainer}>
        <ChatInput
          onSend={handleSend}
          placeholder={t("Ask anything about your pages...")}
        />
      </div>
    </div>
  );
}
