import DOMPurify from "dompurify";
import { flattenHtmlBlocks, markdownToHtml } from "@docmost/editor-ext";

// Model output is untrusted (page content can steer it), so the HTML is
// always sanitized before it is rendered. HTML layouts the model writes
// (divs, svg icons) render as the text they show, see flattenHtmlBlocks.
export async function renderAiMarkdown(markdown: string): Promise<string> {
  const html = await markdownToHtml(flattenHtmlBlocks(markdown));
  return DOMPurify.sanitize(html, { USE_PROFILES: { html: true } });
}

// markdownToHtml parses synchronously (marked without async extensions), so
// a render can use it directly instead of waiting a tick for the promise.
export function renderAiMarkdownSync(markdown: string): string {
  const html = markdownToHtml(flattenHtmlBlocks(markdown)) as string;
  return DOMPurify.sanitize(html, { USE_PROFILES: { html: true } });
}
