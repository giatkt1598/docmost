import { useCallback, useEffect, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  getAiChat,
  sendAiChatMessage,
} from "@/features/ai-chat/services/ai-chat-service";
import { AI_CHATS_KEY } from "@/features/ai-chat/queries/ai-chat-query";
import {
  IAiChat,
  IChatMessage,
  IChatSelection,
} from "@/features/ai-chat/types/ai-chat.types";

// One conversation: loads its history and streams new replies into it.
export function useAiChatSession(opts: {
  chatId?: string;
  pageId?: string;
  // called once the server created the chat for the first message
  onChatCreated?: (chat: IAiChat) => void;
  // the text selected on the page when a message is sent
  getSelection?: () => IChatSelection | null;
}) {
  const queryClient = useQueryClient();
  const [messages, setMessages] = useState<IChatMessage[]>([]);
  const [loading, setLoading] = useState(false);
  const [streaming, setStreaming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  // the chat this session writes to; set when the first reply creates it
  const chatIdRef = useRef<string | undefined>(opts.chatId);

  useEffect(() => {
    // switching chats: keep a just-created chat's streamed messages
    if (opts.chatId && opts.chatId === chatIdRef.current && streaming) return;
    chatIdRef.current = opts.chatId;
    abortRef.current?.abort();
    setError(null);
    if (!opts.chatId) {
      setMessages([]);
      return;
    }
    let cancelled = false;
    setLoading(true);
    getAiChat(opts.chatId)
      .then(({ messages }) => !cancelled && setMessages(messages))
      .catch((err) => !cancelled && setError(err?.message ?? String(err)))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [opts.chatId]);

  useEffect(() => () => abortRef.current?.abort(), []);

  const updateReply = (fn: (reply: IChatMessage) => IChatMessage) =>
    setMessages((list) => {
      const next = [...list];
      next[next.length - 1] = fn(next[next.length - 1]);
      return next;
    });

  const send = useCallback(
    async (text: string) => {
      const message = text.trim();
      if (!message || streaming) return;
      setError(null);
      setMessages((list) => [
        ...list,
        { role: "user", content: message },
        { role: "assistant", content: "", toolCalls: [] },
      ]);
      setStreaming(true);
      const abort = new AbortController();
      abortRef.current = abort;
      const selection = opts.getSelection?.();
      try {
        await sendAiChatMessage(
          {
            chatId: chatIdRef.current,
            message,
            ...(opts.pageId && { pageId: opts.pageId }),
            ...(selection?.text && {
              selectionText: selection.text.slice(0, 4000),
              selectionBlockIds: selection.blockIds.slice(0, 50),
            }),
          },
          (event) => {
            switch (event.type) {
              case "chat":
                if (!chatIdRef.current) {
                  chatIdRef.current = event.chat.id;
                  opts.onChatCreated?.(event.chat);
                }
                break;
              case "text":
                updateReply((r) => ({ ...r, content: r.content + event.text }));
                break;
              case "tool-call":
                updateReply((r) => ({
                  ...r,
                  toolCalls: [
                    ...(r.toolCalls ?? []),
                    { id: event.id, name: event.name, input: event.input },
                  ],
                }));
                break;
              case "tool-result":
                updateReply((r) => ({
                  ...r,
                  toolCalls: (r.toolCalls ?? []).map((c) =>
                    c.id === event.id
                      ? {
                          ...c,
                          ok: event.ok,
                          ...(event.editId && { editId: event.editId }),
                        }
                      : c,
                  ),
                }));
                break;
              case "error":
                updateReply((r) => ({ ...r, error: event.message }));
                break;
              case "done":
                updateReply((r) => ({ ...r, id: event.messageId }));
                break;
            }
          },
          abort.signal,
        );
      } catch (err: any) {
        if (err?.name !== "AbortError") {
          updateReply((r) => ({ ...r, error: err?.message ?? String(err) }));
        }
      } finally {
        setStreaming(false);
        queryClient.invalidateQueries({ queryKey: [AI_CHATS_KEY] });
      }
    },
    [
      streaming,
      opts.pageId,
      opts.onChatCreated,
      opts.getSelection,
      queryClient,
    ],
  );

  const stop = useCallback(() => abortRef.current?.abort(), []);

  return { messages, loading, streaming, error, send, stop };
}
