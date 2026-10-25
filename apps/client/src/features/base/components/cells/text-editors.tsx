import { useEffect, useRef, useState, KeyboardEvent } from "react";
import { Button, Group, Text, Textarea } from "@mantine/core";
import { useTranslation } from "react-i18next";
import { CellEditorProps, EditorExit } from "@/features/base/registry/property-types";
import {
  normalizeUrl,
  parseNumberInput,
  textCellValue,
  LONG_TEXT_LIMIT,
} from "@/features/base/utils/cell-values";
import classes from "./cells.module.css";

// Commits once: Enter/Tab commit and then the input blurs, which must not
// commit a second time.
function useCommitOnce(commit: CellEditorProps["commit"], cancel: () => void) {
  const done = useRef(false);
  return {
    commit: (value: unknown, exit?: EditorExit) => {
      if (done.current) return;
      done.current = true;
      commit(value, exit);
    },
    cancel: () => {
      if (done.current) return;
      done.current = true;
      cancel();
    },
  };
}

function exitOf(e: KeyboardEvent): EditorExit | null {
  if (e.key === "Enter") return "Enter";
  if (e.key === "Tab") return e.shiftKey ? "ShiftTab" : "Tab";
  return null;
}

type InlineProps = CellEditorProps & {
  toValue: (text: string) => unknown | undefined;
  inputMode?: "text" | "decimal" | "email" | "url";
  align?: "left" | "right";
};

// One-line editor that replaces the cell content.
function InlineEditor({
  value,
  initialInput,
  commit,
  cancel,
  toValue,
  inputMode = "text",
  align = "left",
}: InlineProps) {
  const once = useCommitOnce(commit, cancel);
  const [text, setText] = useState(
    initialInput ?? (value === null || value === undefined ? "" : String(value)),
  );
  const ref = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.focus();
    const end = el.value.length;
    el.setSelectionRange(end, end);
  }, []);

  const finish = (exit?: EditorExit) => {
    const next = toValue(text);
    // undefined = invalid input: keep the old value
    if (next === undefined) once.cancel();
    else once.commit(next, exit);
  };

  return (
    <input
      ref={ref}
      className={classes.inlineInput}
      style={{ textAlign: align }}
      inputMode={inputMode}
      value={text}
      onChange={(e) => setText(e.currentTarget.value)}
      onBlur={() => finish()}
      onKeyDown={(e) => {
        e.stopPropagation();
        const exit = exitOf(e);
        if (exit) {
          e.preventDefault();
          finish(exit);
        } else if (e.key === "Escape") {
          e.preventDefault();
          once.cancel();
        }
      }}
    />
  );
}

export function TextEditor(props: CellEditorProps) {
  return (
    <InlineEditor {...props} toValue={(t) => textCellValue(props.property.type, t)} />
  );
}

export function UrlEditor(props: CellEditorProps) {
  return <InlineEditor {...props} inputMode="url" toValue={(t) => normalizeUrl(t)} />;
}

export function EmailEditor(props: CellEditorProps) {
  return (
    <InlineEditor
      {...props}
      inputMode="email"
      toValue={(t) => textCellValue("email", t)}
    />
  );
}

export function NumberEditor(props: CellEditorProps) {
  return (
    <InlineEditor
      {...props}
      inputMode="decimal"
      align="right"
      toValue={(t) => parseNumberInput(t)}
    />
  );
}

// Multi-line text in a popover. Ctrl/Cmd+Enter saves, Escape cancels,
// clicking outside saves.
export function LongTextEditor({ value, initialInput, commit, cancel }: CellEditorProps) {
  const { t } = useTranslation();
  const once = useCommitOnce(commit, cancel);
  const [text, setText] = useState(
    initialInput ?? (typeof value === "string" ? value : ""),
  );
  const latest = useRef(text);
  latest.current = text;

  // the popover closes on outside clicks by unmounting the editor
  useEffect(() => () => once.commit(textCellValue("longText", latest.current)), []);

  return (
    <div style={{ width: 360 }}>
      <Textarea
        autosize
        minRows={4}
        maxRows={14}
        autoFocus
        maxLength={LONG_TEXT_LIMIT}
        value={text}
        onChange={(e) => setText(e.currentTarget.value)}
        onKeyDown={(e) => {
          e.stopPropagation();
          if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
            e.preventDefault();
            once.commit(textCellValue("longText", text), "Enter");
          } else if (e.key === "Escape") {
            e.preventDefault();
            once.cancel();
          }
        }}
      />
      <Group justify="space-between" mt={6}>
        <Text size="xs" c="dimmed">
          {t("Ctrl+Enter to save")}
        </Text>
        <Button
          size="compact-xs"
          onClick={() => once.commit(textCellValue("longText", text), "Enter")}
        >
          {t("Save")}
        </Button>
      </Group>
    </div>
  );
}
