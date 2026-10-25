import type { Editor, JSONContent } from "@tiptap/core";
import { ITemplate } from "@/features/template/types/template.types";

// Template content is stored as a ProseMirror JSON document; older or
// hand-made records may hold it as a JSON string.
function templateDocument(content: unknown): JSONContent | null {
  let value = content;
  if (typeof value === "string") {
    try {
      value = JSON.parse(value);
    } catch {
      return null;
    }
  }
  if (!value || typeof value !== "object") return null;
  const doc = value as JSONContent;
  if (doc.type !== "doc") return null;
  return Array.isArray(doc.content) && doc.content.length > 0 ? doc : null;
}

const usable = (e: Editor | null | undefined): e is Editor => !!e && !e.isDestroyed;

// Fills an empty page with a template: its content goes into the page
// editor and its title into the title editor (when the page has no title
// yet). Returns false, changing nothing, when the page is no longer empty
// or the editors are gone.
export function applyTemplateToPage(
  editor: Editor | null | undefined,
  titleEditor: Editor | null | undefined,
  template: ITemplate,
): boolean {
  if (!usable(editor) || !usable(titleEditor)) return false;
  // someone may have typed (or a collaborator synced) content meanwhile
  if (!editor.isEmpty) return false;

  const doc = templateDocument(template.content);
  if (doc) {
    const ok = editor.commands.setContent(doc, { emitUpdate: true });
    if (!ok) return false;
  }

  const title = template.title?.trim();
  if (title && titleEditor.getText().trim() === "") {
    // the title editor's schema is a single level-1 heading
    titleEditor.commands.setContent(
      { type: "doc", content: [{ type: "heading", attrs: { level: 1 }, content: [{ type: "text", text: title }] }] },
      { emitUpdate: true },
    );
  }

  editor.commands.focus("start");
  return true;
}
