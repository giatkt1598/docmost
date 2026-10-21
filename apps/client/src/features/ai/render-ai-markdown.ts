import DOMPurify from "dompurify";
import { markdownToHtml } from "@docmost/editor-ext";

// Model output is untrusted (page content can steer it), so the HTML is
// always sanitized before it is rendered.
export async function renderAiMarkdown(markdown: string): Promise<string> {
  const html = await markdownToHtml(markdown);
  return DOMPurify.sanitize(html, { USE_PROFILES: { html: true } });
}
