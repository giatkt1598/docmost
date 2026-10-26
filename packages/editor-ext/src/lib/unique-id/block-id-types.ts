// Block nodes that carry a stable `id` attribute, so tools (the AI page
// tools in particular) can address a block across edits. Shared by the
// editor and the server so both assign ids to the same nodes.
//
// Left out: nodes that already use `id` for something else (tab, footnote,
// mention), inline nodes, and parts that only exist inside one parent
// (table rows and cells, details summary/content, tab label/panel).
export const BLOCK_ID_TYPES = [
  "paragraph",
  "heading",
  "blockquote",
  "callout",
  "codeBlock",
  "horizontalRule",
  "bulletList",
  "orderedList",
  "listItem",
  "taskList",
  "taskItem",
  "table",
  "mathBlock",
  "details",
  "columns",
  "column",
  "tabs",
  "image",
  "video",
  "audio",
  "pdf",
  "attachment",
  "drawio",
  "excalidraw",
  "embed",
  "youtube",
  "subpages",
  "pageBreak",
  "transclusionSource",
  "transclusionReference",
  "base",
  "integrationCard",
];
