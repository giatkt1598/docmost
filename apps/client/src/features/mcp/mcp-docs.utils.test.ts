import { describe, expect, it } from "vitest";
import { clientConfig, groupTools } from "@/features/mcp/mcp-docs.utils";

const URL = "https://docs.example.com/api/mcp-server";

describe("clientConfig", () => {
  it("builds a Claude Code command", () => {
    expect(clientConfig("claude-code", URL)).toBe(
      `claude mcp add --transport http docmost ${URL} --header "Authorization: Bearer <YOUR_MCP_TOKEN>"`,
    );
  });

  it("builds valid JSON configs pointing at the server", () => {
    const cursor = JSON.parse(clientConfig("cursor", URL));
    expect(cursor.mcpServers.docmost).toEqual({
      url: URL,
      headers: { Authorization: "Bearer <YOUR_MCP_TOKEN>" },
    });

    const vscode = JSON.parse(clientConfig("vscode", URL));
    expect(vscode.servers.docmost.type).toBe("http");

    const desktop = JSON.parse(clientConfig("claude-desktop", URL));
    expect(desktop.mcpServers.docmost.args).toContain(URL);
    expect(desktop.mcpServers.docmost.env.AUTH_HEADER).toBe(
      "Bearer <YOUR_MCP_TOKEN>",
    );
  });
});

describe("groupTools", () => {
  const tool = (name: string) => ({
    name,
    description: "",
    readOnly: true,
    params: [],
  });

  it("groups known tools in order and collects the rest as other", () => {
    const groups = groupTools([
      tool("future_tool"),
      tool("import_zip"),
      tool("create_page"),
      tool("get_page"),
    ]);
    expect(groups.map((g) => g.id)).toEqual(["pages", "import", "other"]);
    expect(groups[0].tools.map((t) => t.name)).toEqual([
      "get_page",
      "create_page",
    ]);
    expect(groups[2].tools.map((t) => t.name)).toEqual(["future_tool"]);
  });
});
