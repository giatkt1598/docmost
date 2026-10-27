import { useState } from "react";
import {
  Alert,
  Anchor,
  Code,
  Group,
  List,
  Paper,
  SimpleGrid,
  Stack,
  Tabs,
  Text,
  Title,
} from "@mantine/core";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import SettingsTitle from "@/components/settings/settings-title.tsx";
import { DocumentTitle } from "@/components/ui/document-title.tsx";
import CopyTextButton from "@/components/common/copy.tsx";
import { getMcpServerUrl } from "@/features/mcp/mcp.utils";
import {
  clientConfig,
  groupTools,
  McpClientId,
  TOKEN_PLACEHOLDER,
} from "@/features/mcp/mcp-docs.utils";
import {
  useMcpServerInfoQuery,
  useMcpToolsQuery,
} from "@/features/mcp/queries/mcp-token-query";
import { McpToolReference } from "@/features/mcp/components/mcp-tool-reference";
import { useToolGroupLabels } from "@/features/mcp/components/use-tool-group-labels";

const TOKENS_PATH = "/settings/account/mcp";

export default function McpDocs() {
  const { t } = useTranslation();
  const { data: info } = useMcpServerInfoQuery();
  const enabled = info?.enabled !== false;
  const { data: tools, isLoading } = useMcpToolsQuery(enabled);

  return (
    <>
      <DocumentTitle title={t("MCP documentation")} />
      <SettingsTitle title={t("MCP documentation")} />

      {!enabled && (
        <Alert color="gray" mb="lg">
          {t(
            "The MCP server is disabled. Set MCP_SERVER_ENABLED=true in the server environment to enable it.",
          )}
        </Alert>
      )}

      <Stack gap="xl">
        <Overview toolCount={tools?.length} tools={tools} />
        <Installation />
        <Usage />

        <section>
          <Title order={3} mb="xs">
            {t("Tool reference")}
          </Title>
          <Text size="sm" c="dimmed" mb="md">
            {t(
              "Every tool your token can use, as the assistant sees it. Assistants choose tools on their own; you rarely need to name one.",
            )}
          </Text>
          <McpToolReference tools={tools} isLoading={isLoading && enabled} />
        </section>
      </Stack>
    </>
  );
}

function Overview({
  toolCount,
  tools,
}: {
  toolCount?: number;
  tools?: Parameters<typeof groupTools>[0];
}) {
  const { t } = useTranslation();
  const labels = useToolGroupLabels();
  const groups = groupTools(tools ?? []).filter((g) => g.id !== "other");

  return (
    <section>
      <Title order={3} mb="xs">
        {t("Overview")}
      </Title>
      <Text size="sm" mb="md">
        {t(
          "The MCP server lets AI assistants such as Claude, Cursor or VS Code Copilot work in this workspace: read and search your pages, write and edit content, and organise spaces, comments and bases. The assistant acts as you, with exactly your permissions.",
        )}
        {toolCount
          ? " " +
            t("Your token gives access to {{count}} tools.", {
              count: toolCount,
            })
          : ""}
      </Text>
      <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="sm">
        {groups.map((group) => (
          <Paper key={group.id} withBorder p="sm" radius="md">
            <Group justify="space-between" mb={4} wrap="nowrap">
              <Text size="sm" fw={500}>
                {labels[group.id]?.title}
              </Text>
              <Text size="xs" c="dimmed">
                {t("{{count}} tools", { count: group.tools.length })}
              </Text>
            </Group>
            <Text size="xs" c="dimmed">
              {labels[group.id]?.summary}
            </Text>
          </Paper>
        ))}
      </SimpleGrid>
    </section>
  );
}

function Snippet({ code }: { code: string }) {
  return (
    <Paper withBorder radius="md" p="xs" pos="relative">
      <div style={{ position: "absolute", top: 6, right: 6 }}>
        <CopyTextButton text={code} />
      </div>
      <Code
        block
        style={{
          whiteSpace: "pre-wrap",
          wordBreak: "break-all",
          paddingRight: 36,
          background: "transparent",
        }}
      >
        {code}
      </Code>
    </Paper>
  );
}

function Installation() {
  const { t } = useTranslation();
  const url = getMcpServerUrl();
  const [client, setClient] = useState<McpClientId>("claude-code");

  const where: Record<McpClientId, string> = {
    "claude-code": t("Run in a terminal:"),
    "claude-desktop": t(
      "Settings > Developer > Edit config opens claude_desktop_config.json. Add this, then restart Claude Desktop (needs Node.js for npx):",
    ),
    cursor: t(
      "Add to ~/.cursor/mcp.json (all projects) or .cursor/mcp.json (one project):",
    ),
    vscode: t(
      "Add to .vscode/mcp.json in your project, or run MCP: Add Server from the command palette:",
    ),
  };

  return (
    <section>
      <Title order={3} mb="xs">
        {t("Installation")}
      </Title>
      <List type="ordered" size="sm" spacing="xs" mb="md">
        <List.Item>
          <Anchor component={Link} to={TOKENS_PATH} size="sm">
            {t("Create an MCP token")}
          </Anchor>{" "}
          {t(
            "and copy it: it is shown only once. Give it an expiry date on shared computers.",
          )}
        </List.Item>
        <List.Item>
          {t(
            "Add the Docmost server to your assistant with the snippet below and replace",
          )}{" "}
          <Code>{TOKEN_PLACEHOLDER}</Code> {t("with your token.")}
        </List.Item>
        <List.Item>
          {t(
            'Restart or reload the assistant and check that the "docmost" server is connected, then ask something like "List my Docmost spaces".',
          )}
        </List.Item>
      </List>

      <Tabs
        value={client}
        onChange={(value) => value && setClient(value as McpClientId)}
        keepMounted={false}
      >
        <Tabs.List mb="sm">
          <Tabs.Tab value="claude-code">Claude Code</Tabs.Tab>
          <Tabs.Tab value="claude-desktop">Claude Desktop</Tabs.Tab>
          <Tabs.Tab value="cursor">Cursor</Tabs.Tab>
          <Tabs.Tab value="vscode">VS Code</Tabs.Tab>
        </Tabs.List>
        {(Object.keys(where) as McpClientId[]).map((id) => (
          <Tabs.Panel key={id} value={id}>
            <Text size="sm" mb="xs">
              {where[id]}
            </Text>
            <Snippet code={clientConfig(id, url)} />
          </Tabs.Panel>
        ))}
      </Tabs>

      <Paper withBorder radius="md" p="sm" mt="md">
        <Text size="sm" fw={500} mb={4}>
          {t("Other clients")}
        </Text>
        <List size="sm" spacing={4}>
          <List.Item>
            {t("Transport")}: <Code>Streamable HTTP</Code>
          </List.Item>
          <List.Item>
            {t("Server URL")}: <Code>{url}</Code>
          </List.Item>
          <List.Item>
            {t("Header")}:{" "}
            <Code>Authorization: Bearer {TOKEN_PLACEHOLDER}</Code>
          </List.Item>
        </List>
      </Paper>
    </section>
  );
}

function Usage() {
  const { t } = useTranslation();

  const prompts = [
    t(
      "Find the onboarding guide in the Engineering space and summarise it in five bullet points.",
    ),
    t(
      'Create a page "Meeting notes" under Projects with these notes, and add the label "meeting".',
    ),
    t(
      "In this page (paste its link), rewrite the Deployment section with the steps below. Keep the rest unchanged.",
    ),
    t("Import https://example.com/article into the Research space."),
    t(
      "List the open comments on this page and resolve the ones that are already done.",
    ),
    t(
      'Add a row to the Tasks base: "Write release notes", status In progress.',
    ),
    t("Undo your last edit on this page."),
  ];

  return (
    <section>
      <Title order={3} mb="xs">
        {t("Usage")}
      </Title>
      <Text size="sm" mb="xs">
        {t(
          "Talk to the assistant in plain language; it picks the right tools. Most clients ask you to approve each tool call. Some things to try:",
        )}
      </Text>
      <List size="sm" spacing={4} mb="md">
        {prompts.map((prompt) => (
          <List.Item key={prompt}>
            <Text size="sm" fs="italic" span>
              {prompt}
            </Text>
          </List.Item>
        ))}
      </List>

      <Text size="sm" fw={500} mb={4}>
        {t("Good to know")}
      </Text>
      <List size="sm" spacing={4}>
        <List.Item>
          {t(
            "The assistant acts as you: it sees and edits only what you can. Workspace admins can restrict MCP to admins.",
          )}
        </List.Item>
        <List.Item>
          {t(
            "Point at a page with its link, slug or id; pasting the page URL from the browser works.",
          )}
        </List.Item>
        <List.Item>
          {t(
            "Edits made through MCP are saved in page history and marked as AI edits, so you can ask the assistant to undo one or restore an earlier version.",
          )}
        </List.Item>
        <List.Item>
          {t(
            "For long pages, ask the assistant to read the outline first and then edit one section: it is faster and changes only what you meant.",
          )}
        </List.Item>
        <List.Item>
          {t(
            "Revoke a token on the MCP Server page as soon as a device or assistant should lose access.",
          )}
        </List.Item>
      </List>
    </section>
  );
}
