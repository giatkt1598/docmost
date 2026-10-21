import { useEffect, useLayoutEffect, useRef, useState } from "react";
import {
  ActionIcon,
  Box,
  Button,
  Group,
  Loader,
  NavLink,
  Paper,
  Portal,
  ScrollArea,
  Stack,
  Text,
  TextInput,
  Typography,
} from "@mantine/core";
import { useClickOutside } from "@mantine/hooks";
import {
  IconArrowBack,
  IconArrowsMaximize,
  IconArrowsMinimize,
  IconCheck,
  IconChevronRight,
  IconLanguage,
  IconListDetails,
  IconMoodSmile,
  IconPencil,
  IconPlayerStop,
  IconRefresh,
  IconSend,
  IconSparkles,
  IconTextGrammar,
  IconWand,
  IconX,
} from "@tabler/icons-react";
import { Editor } from "@tiptap/react";
import { DOMSerializer } from "@tiptap/pm/model";
import { useAtom, useAtomValue } from "jotai";
import { useTranslation } from "react-i18next";
import { htmlToMarkdown, markdownToHtml } from "@docmost/editor-ext";
import { renderAiMarkdown } from "@/features/ai/render-ai-markdown";
import {
  aiMenuAnchorAtom,
  showAiMenuAtom,
} from "@/features/editor/atoms/editor-atoms";
import {
  AiAssistAction,
  IAiAssistRequest,
  streamAiAssist,
} from "@/features/ai/services/ai-service";

const LANGUAGES = [
  "Vietnamese",
  "English",
  "Japanese",
  "Korean",
  "Chinese",
  "French",
  "German",
  "Spanish",
];
const TONES = [
  { value: "professional", label: "Professional" },
  { value: "casual", label: "Casual" },
  { value: "friendly", label: "Friendly" },
  { value: "confident", label: "Confident" },
  { value: "straightforward", label: "Straightforward" },
];
const CONTEXT_CHARS = 4000;
const PANEL_WIDTH = 480;
// room the panel needs below the button before it opens above instead
const MIN_SPACE_BELOW = 360;
const GAP = 6;
const EDGE = 8;

type Target = { from: number; to: number; text: string; hasSelection: boolean };

function selectionMarkdown(editor: Editor, from: number, to: number) {
  const slice = editor.state.doc.slice(from, to);
  const div = document.createElement("div");
  div.appendChild(
    DOMSerializer.fromSchema(editor.schema).serializeFragment(slice.content),
  );
  return htmlToMarkdown(div.innerHTML);
}

// "Ask AI" panel opened from the bubble menu or the toolbar: runs an action
// on the selection and lets the user replace it or insert the result.
export function EditorAiMenu({ editor }: { editor: Editor }) {
  const { t } = useTranslation();
  const [opened, setOpened] = useAtom(showAiMenuAtom);
  const anchor = useAtomValue(aiMenuAnchorAtom);
  const [target, setTarget] = useState<Target | null>(null);
  const [position, setPosition] = useState({
    top: 0,
    left: 0,
    above: false,
  });
  const inputRef = useRef<HTMLInputElement>(null);
  const [prompt, setPrompt] = useState("");
  const [submenu, setSubmenu] = useState<"translate" | "tone" | null>(null);
  const [output, setOutput] = useState("");
  const [outputHtml, setOutputHtml] = useState("");
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastRequest, setLastRequest] = useState<IAiAssistRequest | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const close = () => {
    abortRef.current?.abort();
    setOpened(false);
  };
  const panelRef = useClickOutside(() => opened && !running && close());

  // where the selection started on screen when the menu opened; the panel
  // keeps its offset to it while the page scrolls
  const scrollRef = useRef({ from: 0, top: 0 });

  // capture the selection and place the panel at the button that opened it,
  // before paint so it never shows up somewhere else first
  useLayoutEffect(() => {
    if (!opened) return;
    const { from, to, empty } = editor.state.selection;
    const text = empty
      ? editor.state.doc.textBetween(
          Math.max(0, from - CONTEXT_CHARS),
          from,
          "\n",
        )
      : selectionMarkdown(editor, from, to);
    setTarget({ from, to, text, hasSelection: !empty });

    const start = editor.view.coordsAtPos(from);
    const end = editor.view.coordsAtPos(to);
    // without a button (e.g. a shortcut) fall back to the selection
    const rect = anchor ?? {
      top: start.top,
      bottom: end.bottom,
      left: end.left,
    };
    const spaceBelow = window.innerHeight - rect.bottom;
    const above = spaceBelow < MIN_SPACE_BELOW && rect.top > spaceBelow;
    scrollRef.current = { from, top: start.top };
    setPosition({
      // when above, the panel grows upwards from the top of the button
      top: above ? rect.top - GAP : rect.bottom + GAP,
      left: Math.max(
        EDGE,
        Math.min(rect.left, window.innerWidth - PANEL_WIDTH - EDGE),
      ),
      above,
    });
    setPrompt("");
    setSubmenu(null);
    setOutput("");
    setOutputHtml("");
    setError(null);
    setLastRequest(null);
  }, [opened]);

  // follow the selection when the page (or any scroll container) scrolls
  useEffect(() => {
    if (!opened) return;
    let frame = 0;
    const onScroll = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const { from, top } = scrollRef.current;
        let now: number;
        try {
          now = editor.view.coordsAtPos(from).top;
        } catch {
          return;
        }
        const delta = now - top;
        if (delta === 0) return;
        scrollRef.current.top = now;
        setPosition((p) => ({ ...p, top: p.top + delta }));
      });
    };
    window.addEventListener("scroll", onScroll, true);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("scroll", onScroll, true);
    };
  }, [opened]);

  // focus without letting the browser scroll the page to the input
  useEffect(() => {
    if (opened && target) inputRef.current?.focus({ preventScroll: true });
  }, [opened, target]);

  useEffect(() => {
    if (!opened) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && close();
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [opened]);

  useEffect(() => {
    let cancelled = false;
    renderAiMarkdown(output).then((html) => !cancelled && setOutputHtml(html));
    return () => {
      cancelled = true;
    };
  }, [output]);

  if (!opened || !target) return null;

  const run = async (request: Omit<IAiAssistRequest, "text">) => {
    const full = { ...request, text: target.text };
    setLastRequest(full);
    setSubmenu(null);
    setOutput("");
    setError(null);
    setRunning(true);
    const abort = new AbortController();
    abortRef.current = abort;
    try {
      await streamAiAssist(full, setOutput, abort.signal);
    } catch (err: any) {
      if (err?.name !== "AbortError") setError(err?.message ?? String(err));
    } finally {
      setRunning(false);
    }
  };

  const apply = async (mode: "replace" | "insert") => {
    const html = await markdownToHtml(output);
    const range =
      mode === "replace" && target.hasSelection
        ? { from: target.from, to: target.to }
        : target.to;
    editor.chain().focus().insertContentAt(range, html).run();
    close();
  };

  const action = (
    label: string,
    icon: React.ReactNode,
    request: Omit<IAiAssistRequest, "text">,
  ) => (
    <NavLink
      key={label}
      label={label}
      leftSection={icon}
      onClick={() => run(request)}
      disabled={!target.hasSelection && request.action !== "continue"}
      py={6}
    />
  );

  const hasResult = !!output || running || !!error;

  return (
    <Portal>
      <Paper
        ref={panelRef}
        shadow="lg"
        radius="md"
        withBorder
        w={PANEL_WIDTH}
        p="xs"
        style={{
          position: "fixed",
          top: position.top,
          left: position.left,
          ...(position.above && { transform: "translateY(-100%)" }),
          zIndex: 300,
        }}
      >
        <Stack gap="xs">
          {hasResult && (
            <Box>
              {error ? (
                <Text size="sm" c="red">
                  {error}
                </Text>
              ) : (
                <ScrollArea.Autosize mah={320}>
                  {output ? (
                    <Typography fz="sm">
                      <div dangerouslySetInnerHTML={{ __html: outputHtml }} />
                    </Typography>
                  ) : (
                    <Group gap="xs">
                      <Loader size="xs" />
                      <Text size="sm" c="dimmed">
                        {t("AI is writing...")}
                      </Text>
                    </Group>
                  )}
                </ScrollArea.Autosize>
              )}
              <Group gap="xs" mt="xs">
                {running ? (
                  <Button
                    size="xs"
                    variant="default"
                    leftSection={<IconPlayerStop size={14} />}
                    onClick={() => abortRef.current?.abort()}
                  >
                    {t("Stop")}
                  </Button>
                ) : (
                  <>
                    {output && target.hasSelection && (
                      <Button
                        size="xs"
                        leftSection={<IconCheck size={14} />}
                        onClick={() => apply("replace")}
                      >
                        {t("Replace selection")}
                      </Button>
                    )}
                    {output && (
                      <Button
                        size="xs"
                        variant={target.hasSelection ? "default" : "filled"}
                        leftSection={<IconArrowBack size={14} />}
                        onClick={() => apply("insert")}
                      >
                        {t("Insert below")}
                      </Button>
                    )}
                    {lastRequest && (
                      <Button
                        size="xs"
                        variant="default"
                        leftSection={<IconRefresh size={14} />}
                        onClick={() => run(lastRequest)}
                      >
                        {t("Try again")}
                      </Button>
                    )}
                    <Button
                      size="xs"
                      variant="subtle"
                      color="gray"
                      leftSection={<IconX size={14} />}
                      onClick={close}
                    >
                      {t("Discard")}
                    </Button>
                  </>
                )}
              </Group>
            </Box>
          )}

          <TextInput
            ref={inputRef}
            leftSection={<IconSparkles size={16} />}
            placeholder={
              target.hasSelection
                ? t("Tell AI what to do with the selection...")
                : t("Ask AI to write something...")
            }
            value={prompt}
            onChange={(e) => setPrompt(e.currentTarget.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && prompt.trim() && !running) {
                e.preventDefault();
                run({ action: "custom", prompt: prompt.trim() });
              }
            }}
            disabled={running}
            rightSection={
              <ActionIcon
                variant="subtle"
                disabled={!prompt.trim() || running}
                onClick={() => run({ action: "custom", prompt: prompt.trim() })}
                aria-label={t("Send")}
              >
                <IconSend size={16} />
              </ActionIcon>
            }
          />

          {!hasResult && (
            <Box>
              {submenu === "translate" &&
                LANGUAGES.map((language) =>
                  action(t(language), <IconLanguage size={16} />, {
                    action: "translate",
                    language,
                  }),
                )}
              {submenu === "tone" &&
                TONES.map(({ value: tone, label }) =>
                  action(t(label), <IconMoodSmile size={16} />, {
                    action: "tone",
                    tone,
                  }),
                )}
              {!submenu && (
                <>
                  {!target.hasSelection && (
                    <Text size="xs" c="dimmed" px="sm" py={4}>
                      {t("Select text to edit it with AI.")}
                    </Text>
                  )}
                  {action(t("Improve writing"), <IconWand size={16} />, {
                    action: "improve",
                  })}
                  {action(
                    t("Fix spelling & grammar"),
                    <IconTextGrammar size={16} />,
                    { action: "fix_grammar" },
                  )}
                  {action(t("Make shorter"), <IconArrowsMinimize size={16} />, {
                    action: "shorter",
                  })}
                  {action(t("Make longer"), <IconArrowsMaximize size={16} />, {
                    action: "longer",
                  })}
                  {action(t("Simplify language"), <IconPencil size={16} />, {
                    action: "simplify",
                  })}
                  {action(t("Summarize"), <IconListDetails size={16} />, {
                    action: "summarize",
                  })}
                  <NavLink
                    label={t("Translate")}
                    leftSection={<IconLanguage size={16} />}
                    rightSection={<IconChevronRight size={14} />}
                    onClick={() => setSubmenu("translate")}
                    disabled={!target.hasSelection}
                    py={6}
                  />
                  <NavLink
                    label={t("Change tone")}
                    leftSection={<IconMoodSmile size={16} />}
                    rightSection={<IconChevronRight size={14} />}
                    onClick={() => setSubmenu("tone")}
                    disabled={!target.hasSelection}
                    py={6}
                  />
                  {action(t("Continue writing"), <IconPencil size={16} />, {
                    action: "continue",
                  })}
                </>
              )}
              {submenu && (
                <NavLink
                  label={t("Back")}
                  leftSection={<IconArrowBack size={16} />}
                  onClick={() => setSubmenu(null)}
                  py={6}
                />
              )}
            </Box>
          )}
        </Stack>
      </Paper>
    </Portal>
  );
}
