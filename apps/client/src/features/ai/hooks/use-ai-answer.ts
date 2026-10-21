import { useCallback, useEffect, useRef, useState } from "react";
import {
  IAiSource,
  streamAiAnswer,
} from "@/features/ai/services/ai-answer-service";

export interface AiAnswerState {
  answer: string;
  sources: IAiSource[];
  loading: boolean;
  // false once the search found no page to answer from
  found: boolean | null;
  error: string | null;
}

const EMPTY: AiAnswerState = {
  answer: "",
  sources: [],
  loading: false,
  found: null,
  error: null,
};

export function useAiAnswer() {
  const [state, setState] = useState<AiAnswerState>(EMPTY);
  const abortRef = useRef<AbortController | null>(null);

  const reset = useCallback(() => {
    abortRef.current?.abort();
    setState(EMPTY);
  }, []);

  const ask = useCallback(async (query: string, spaceId?: string) => {
    abortRef.current?.abort();
    const abort = new AbortController();
    abortRef.current = abort;
    setState({ ...EMPTY, loading: true });
    try {
      await streamAiAnswer(
        { query, ...(spaceId && { spaceId }) },
        (event) =>
          setState((s) =>
            event.type === "sources"
              ? { ...s, sources: event.sources }
              : event.type === "text"
                ? { ...s, answer: s.answer + event.text }
                : { ...s, found: event.found },
          ),
        abort.signal,
      );
      setState((s) => ({ ...s, loading: false }));
    } catch (err: any) {
      if (err?.name === "AbortError") return;
      setState((s) => ({
        ...s,
        loading: false,
        error: err?.message ?? String(err),
      }));
    }
  }, []);

  useEffect(() => () => abortRef.current?.abort(), []);

  return { ...state, ask, reset };
}
