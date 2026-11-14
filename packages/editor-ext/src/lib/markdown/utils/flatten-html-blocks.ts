import type { Token } from "marked";
import { lexMarkdown } from "./marked.utils";

const HIDDEN_ELEMENTS =
  /<!--[\s\S]*?(-->|$)|<(script|style|svg|template)\b[\s\S]*?(<\/\2\s*>|$)/gi;
const LINE_BREAK_TAGS =
  /<br\s*\/?>|<\/(p|div|li|tr|h[1-6]|section|article|header|footer)\s*>/gi;
const ANY_TAG = /<\/?[A-Za-z][^<>]*>/g;
const HAS_TAG = /<\/?[A-Za-z][^<>]*>/;

// The text an HTML block shows: trimmed lines, so indentation cannot turn
// into code blocks, and one blank line at most.
function htmlText(html: string): string {
  const text = html
    .replace(HIDDEN_ELEMENTS, "")
    .replace(LINE_BREAK_TAGS, "\n")
    .replace(ANY_TAG, "");
  return text
    .split("\n")
    .map((line) => line.trim())
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/^\n+|\n+$/g, "");
}

// Models sometimes lay an answer out with divs, spans and svg icons. Kept as
// HTML, the Markdown inside stays literal and its indentation shows as gaps,
// so each top-level HTML block becomes the text it shows. Code blocks keep
// their markup.
export function flattenHtmlBlocks(markdown: string): string {
  const text = markdown.replace(/\r\n/g, "\n");
  // indented markup inside such a layout lexes as indented code: it is part
  // of the same layout
  const layout = (token: Token) =>
    token.type === "html" ||
    (token.type === "code" &&
      (token as Token & { codeBlockStyle?: string }).codeBlockStyle ===
        "indented" &&
      HAS_TAG.test(token.raw));
  let tokens: Token[];
  try {
    tokens = lexMarkdown(text);
  } catch {
    return text;
  }
  if (!tokens.some(layout)) return text;
  return tokens
    .map((token) => (layout(token) ? `\n${htmlText(token.raw)}\n\n` : token.raw))
    .join("");
}
