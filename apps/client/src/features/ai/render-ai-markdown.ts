import DOMPurify from "dompurify";
import { markdownToHtml } from "@docmost/editor-ext";

// Model output is untrusted (page content can steer it), so the HTML is
// always sanitized before it is rendered.
export async function renderAiMarkdown(markdown: string): Promise<string> {
  const html = await markdownToHtml(markdown);
  return DOMPurify.sanitize(html, { USE_PROFILES: { html: true } });
}

// markdownToHtml parses synchronously (marked without async extensions), so
// a render can use it directly instead of waiting a tick for the promise.
export function renderAiMarkdownSync(markdown: string): string {
  const html = markdownToHtml(markdown) as string;
  return DOMPurify.sanitize(html, { USE_PROFILES: { html: true } });
}
