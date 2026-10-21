import api from "@/lib/api-client";

// what every member may know: whether AI works and which features are on
export interface IAiStatus {
  configured: boolean;
  settings: { generative?: boolean; search?: boolean; chat?: boolean };
}

export type AiAssistAction =
  | "improve"
  | "fix_grammar"
  | "shorter"
  | "longer"
  | "simplify"
  | "summarize"
  | "continue"
  | "translate"
  | "tone"
  | "custom";

export interface IAiAssistRequest {
  action: AiAssistAction;
  text: string;
  prompt?: string;
  language?: string;
  tone?: string;
}

export async function getAiStatus(): Promise<IAiStatus> {
  const req = await api.post<IAiStatus>("/ai-assist/status");
  return req.data;
}

// Reads a plain-text stream, calling onText with the full text so far.
export async function readTextStream(
  response: Response,
  onText: (text: string) => void,
): Promise<string> {
  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    throw new Error(body?.message ?? `HTTP ${response.status}`);
  }
  const reader = response.body?.getReader();
  const decoder = new TextDecoder();
  let text = "";
  if (!reader) return text;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    text += decoder.decode(value, { stream: true });
    onText(text);
  }
  return text;
}

export async function streamAiAssist(
  request: IAiAssistRequest,
  onText: (text: string) => void,
  signal?: AbortSignal,
): Promise<string> {
  const response = await fetch("/api/ai-assist/generate", {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(request),
    signal,
  });
  return readTextStream(response, onText);
}
