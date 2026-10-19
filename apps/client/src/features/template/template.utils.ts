import { Editor } from "@tiptap/core";
import { ITemplate } from "@/features/template/types/template.types";

// Fills an empty page with the template; returns false if the page has content.
export function applyTemplateToPage(
  editor: Editor,
  titleEditor: Editor,
  template: ITemplate,
): boolean {
  if (!editor.isEmpty) return false;

  if (titleEditor.isEmpty && template.title) {
    titleEditor.commands.setContent(template.title, { emitUpdate: true });
  }
  if (template.content) {
    editor.commands.setContent(template.content, { emitUpdate: true });
  }
  return true;
}
