import { useEffect, useRef, useState } from "react";
import {
  ActionIcon,
  Box,
  Button,
  Group,
  Loader,
  NavLink,
  Paper,
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
import { useAtom } from "jotai";
import { useTranslation } from "react-i18next";
import { htmlToMarkdown, markdownToHtml } from "@docmost/editor-ext";
import { showAiMenuAtom } from "@/features/editor/atoms/editor-atoms";
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
  const [target, setTarget] = useState<Target | null>(null);
  const [position, setPosition] = useState({ top: 0, left: 0 });
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

  // capture the selection and place the panel under it when opening
  useEffect(() => {
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

    const container = editor.view.dom.closest(".editor-container");
    const coords = editor.view.coordsAtPos(to);
    const box = container?.getBoundingClientRect();
    if (box) {
      setPosition({
        top: coords.bottom - box.top + 8,
        left: Math.max(0, Math.min(coords.left - box.left, box.width - 480)),
      });
    }
    setPrompt("");
    setSubmenu(null);
    setOutput("");
    setOutputHtml("");
    setError(null);
    setLastRequest(null);
  }, [opened]);

  useEffect(() => {
    if (!opened) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && close();
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [opened]);

  useEffect(() => {
    let cancelled = false;
    Promise.resolve(markdownToHtml(output)).then(
      (html) => !cancelled && setOutputHtml(html),
    );
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
    <Paper
      ref={panelRef}
      shadow="lg"
      radius="md"
      withBorder
      w={480}
      p="xs"
      style={{
        position: "absolute",
        top: position.top,
        left: position.left,
        zIndex: 200,
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
          data-autofocus
          autoFocus
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
  );
}
