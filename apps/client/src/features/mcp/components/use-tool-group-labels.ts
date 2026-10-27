import { useTranslation } from "react-i18next";

// Title and one-line summary of each tool group (see TOOL_GROUPS).
export function useToolGroupLabels(): Record<
  string,
  { title: string; summary: string }
> {
  const { t } = useTranslation();
  return {
    pages: {
      title: t("Pages"),
      summary: t(
        "Find, read, create, update, move, copy, duplicate, trash and restore pages. Content is read and written as Markdown.",
      ),
    },
    blocks: {
      title: t("Page content"),
      summary: t(
        "Read a page as blocks with stable ids and edit precisely: insert, update, move or delete blocks, or apply several changes at once.",
      ),
    },
    history: {
      title: t("History and undo"),
      summary: t(
        "List page versions, restore an older version, and undo an edit made through MCP or AI.",
      ),
    },
    diagrams: {
      title: t("Diagrams"),
      summary: t("Read the diagrams on a page and add new ones."),
    },
    search: {
      title: t("Search and files"),
      summary: t(
        "Search pages and attachments, search inside PDF and Word files, and attach a file from a URL.",
      ),
    },
    import: {
      title: t("Import"),
      summary: t(
        "Create pages from Markdown, HTML, Word or PDF files and web pages, or import Markdown, Notion and Confluence zip exports.",
      ),
    },
    spaces: {
      title: t("Spaces and people"),
      summary: t(
        "List, create and update spaces, list workspace members, and see who the token acts as.",
      ),
    },
    comments: {
      title: t("Comments"),
      summary: t("Read, write, edit, delete and resolve comments."),
    },
    labels: {
      title: t("Labels and favorites"),
      summary: t("Tag pages with labels and manage favorites."),
    },
    bases: {
      title: t("Bases"),
      summary: t(
        "Work with bases: read their properties, query, add, update and delete rows, and add properties.",
      ),
    },
    other: {
      title: t("Other"),
      summary: "",
    },
  };
}
