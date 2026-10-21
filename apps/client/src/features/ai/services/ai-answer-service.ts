export interface IAiSource {
  index: number;
  pageId: string;
  slugId: string;
  title: string;
  spaceSlug: string;
  excerpt: string;
}

export type AiAnswerEvent =
  | { type: "sources"; sources: IAiSource[] }
  | { type: "text"; text: string }
  | { type: "done"; found: boolean };

// POST /ai-search/answer streams newline-delimited JSON events.
export async function streamAiAnswer(
  body: { query: string; spaceId?: string },
  onEvent: (event: AiAnswerEvent) => void,
  signal?: AbortSignal,
): Promise<void> {
  const response = await fetch("/api/ai-search/answer", {
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
