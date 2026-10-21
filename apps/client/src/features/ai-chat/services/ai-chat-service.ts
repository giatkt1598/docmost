import api from "@/lib/api-client";
import {
  ChatStreamEvent,
  IAiChat,
  IChatMessage,
} from "@/features/ai-chat/types/ai-chat.types";

export async function getAiChats(query?: string): Promise<IAiChat[]> {
  const req = await api.post<IAiChat[]>("/ai-chat", query ? { query } : {});
  return req.data;
}

export async function getAiChat(
  chatId: string,
): Promise<{ chat: IAiChat; messages: IChatMessage[] }> {
  const req = await api.post("/ai-chat/info", { chatId });
  return req.data;
}

export async function renameAiChat(data: {
  chatId: string;
  title: string;
}): Promise<IAiChat> {
  const req = await api.post<IAiChat>("/ai-chat/rename", data);
  return req.data;
}

export async function deleteAiChat(chatId: string): Promise<void> {
  await api.post("/ai-chat/delete", { chatId });
}

// POST /ai-chat/send streams newline-delimited JSON events.
export async function sendAiChatMessage(
  body: { chatId?: string; message: string; pageId?: string },
  onEvent: (event: ChatStreamEvent) => void,
  signal?: AbortSignal,
): Promise<void> {
  const response = await fetch("/api/ai-chat/send", {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal,
  });
  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(error?.message ?? `HTTP ${response.status}`);
  }
  const reader = response.body?.getReader();
  if (!reader) return;
  const decoder = new TextDecoder();
  let buffer = "";
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";
    for (const line of lines) {
      if (line.trim()) onEvent(JSON.parse(line));
    }
  }
  if (buffer.trim()) onEvent(JSON.parse(buffer));
}
