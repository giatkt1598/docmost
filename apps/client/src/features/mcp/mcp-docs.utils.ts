import { IMcpToolDoc } from "@/features/mcp/types/mcp-token.types";

export const TOKEN_PLACEHOLDER = "<YOUR_MCP_TOKEN>";

export type McpClientId =
  | "claude-code"
  | "claude-desktop"
  | "cursor"
  | "vscode";

// How each client is pointed at the server, ready to paste.
export function clientConfig(client: McpClientId, url: string): string {
  const auth = `Bearer ${TOKEN_PLACEHOLDER}`;
  switch (client) {
    case "claude-code":
      return `claude mcp add --transport http docmost ${url} --header "Authorization: ${auth}"`;
    case "claude-desktop":
      // Claude Desktop reaches remote servers with a header through mcp-remote
      return json({
        mcpServers: {
          docmost: {
            command: "npx",
            args: [
              "-y",
              "mcp-remote",
              url,
              "--header",
              "Authorization:${AUTH_HEADER}",
            ],
            env: { AUTH_HEADER: auth },
          },
        },
      });
    case "cursor":
      return json({
        mcpServers: {
          docmost: { url, headers: { Authorization: auth } },
        },
      });
    case "vscode":
      return json({
        servers: {
          docmost: { type: "http", url, headers: { Authorization: auth } },
        },
      });
  }
}

function json(value: unknown): string {
  return JSON.stringify(value, null, 2);
}

// Tool groups for the reference; tools not listed fall under "Other".
export const TOOL_GROUPS: { id: string; tools: string[] }[] = [
  {
    id: "pages",
    tools: [
      "list_pages",
      "list_child_pages",
      "get_page",
      "create_page",
      "update_page",
      "delete_page",
      "restore_page",
      "duplicate_page",
      "move_page",
      "move_page_to_space",
      "copy_page_to_space",
    ],
  },
  {
    id: "blocks",
    tools: [
      "get_page_outline",
      "get_blocks",
      "find_blocks",
      "insert_blocks",
      "update_block",
      "move_block",
      "delete_blocks",
      "apply_operations",
    ],
  },
  {
    id: "history",
    tools: ["list_page_history", "restore_page_version", "undo_ai_edit"],
  },
  { id: "diagrams", tools: ["get_diagram", "add_diagram"] },
  {
    id: "search",
    tools: [
      "search_pages",
      "search_attachments",
      "search_file_contents",
      "upload_file_from_url",
    ],
  },
  { id: "import", tools: ["import_page", "import_zip", "get_import_task"] },
  {
    id: "spaces",
    tools: [
      "list_spaces",
      "get_space",
      "create_space",
      "update_space",
      "list_workspace_members",
      "get_current_user",
    ],
  },
  {
    id: "comments",
    tools: [
      "get_comments",
      "create_comment",
      "update_comment",
      "delete_comment",
      "set_comment_resolved",
    ],
  },
  {
    id: "labels",
    tools: [
      "list_labels",
      "add_page_labels",
      "remove_page_label",
      "add_favorite",
      "remove_favorite",
    ],
  },
  {
    id: "bases",
    tools: [
      "list_bases",
      "get_base",
      "create_base",
      "add_base_property",
      "query_base_rows",
      "create_base_rows",
      "update_base_rows",
      "delete_base_rows",
    ],
  },
];

export function groupTools(
  tools: IMcpToolDoc[],
): { id: string; tools: IMcpToolDoc[] }[] {
  const byName = new Map(tools.map((tool) => [tool.name, tool]));
  const used = new Set<string>();
  const groups = TOOL_GROUPS.map((group) => {
    const found = group.tools
      .map((name) => byName.get(name))
      .filter((tool): tool is IMcpToolDoc => !!tool);
    found.forEach((tool) => used.add(tool.name));
    return { id: group.id, tools: found };
  });
  const other = tools
    .filter((tool) => !used.has(tool.name))
    .sort((a, b) => a.name.localeCompare(b.name));
  return [...groups, { id: "other", tools: other }].filter(
    (group) => group.tools.length > 0,
  );
}
