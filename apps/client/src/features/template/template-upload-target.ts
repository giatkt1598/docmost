// Template editors store this in editor.storage.pageId so the shared upload
// actions (image, video, file, drawio, ...) send files to the template.
const PREFIX = "template:";

export function templateUploadTarget(templateId: string): string {
  return PREFIX + templateId;
}

export function parseTemplateUploadTarget(
  target: string | undefined,
): string | null {
  return target?.startsWith(PREFIX) ? target.slice(PREFIX.length) : null;
}
