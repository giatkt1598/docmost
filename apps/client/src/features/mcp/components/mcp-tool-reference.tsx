import { useMemo, useState } from "react";
import {
  Accordion,
  Badge,
  Center,
  Code,
  Group,
  Loader,
  Stack,
  Table,
  Text,
  TextInput,
  Title,
} from "@mantine/core";
import { IconSearch } from "@tabler/icons-react";
import { useTranslation } from "react-i18next";
import { IMcpToolDoc } from "@/features/mcp/types/mcp-token.types";
import { groupTools } from "@/features/mcp/mcp-docs.utils";
import { useToolGroupLabels } from "@/features/mcp/components/use-tool-group-labels";

interface McpToolReferenceProps {
  tools?: IMcpToolDoc[];
  isLoading: boolean;
}

export function McpToolReference({ tools, isLoading }: McpToolReferenceProps) {
  const { t } = useTranslation();
  const labels = useToolGroupLabels();
  const [query, setQuery] = useState("");

  const groups = useMemo(() => {
    const q = query.trim().toLowerCase();
    const matching = (tools ?? []).filter(
      (tool) =>
        !q ||
        tool.name.toLowerCase().includes(q) ||
        tool.description.toLowerCase().includes(q),
    );
    return groupTools(matching);
  }, [tools, query]);

  return (
    <Stack gap="md">
      <TextInput
        placeholder={t("Search tools")}
        leftSection={<IconSearch size={16} />}
        value={query}
        onChange={(e) => setQuery(e.currentTarget.value)}
      />

      {isLoading ? (
        <Center py="xl">
          <Loader size="sm" />
        </Center>
      ) : groups.length === 0 ? (
        <Text size="sm" c="dimmed" ta="center" py="lg">
          {t("No tools match your search.")}
        </Text>
      ) : (
        groups.map((group) => (
          <div key={group.id}>
            <Title order={5} mb="xs">
              {labels[group.id]?.title ?? group.id}
            </Title>
            <Accordion variant="separated" chevronPosition="right">
              {group.tools.map((tool) => (
                <McpTool key={tool.name} tool={tool} />
              ))}
            </Accordion>
          </div>
        ))
      )}
    </Stack>
  );
}

function McpTool({ tool }: { tool: IMcpToolDoc }) {
  const { t } = useTranslation();

  return (
    <Accordion.Item value={tool.name}>
      <Accordion.Control>
        <Group gap="sm" wrap="nowrap">
          <Text ff="monospace" size="sm" style={{ flexShrink: 0 }}>
            {tool.name}
          </Text>
          <Badge
            size="xs"
            variant="outline"
            color={tool.readOnly ? "gray" : "orange"}
            style={{ flexShrink: 0 }}
          >
            {tool.readOnly ? t("Read") : t("Write")}
          </Badge>
          <Text size="sm" c="dimmed" visibleFrom="sm" lineClamp={1}>
            {tool.description}
          </Text>
        </Group>
      </Accordion.Control>
      <Accordion.Panel>
        <Stack gap="sm">
          <Text size="sm" style={{ whiteSpace: "pre-line" }}>
            {tool.description}
          </Text>
          {tool.params.length > 0 ? (
            <Table.ScrollContainer minWidth={480}>
              <Table withTableBorder verticalSpacing={6} fz="sm">
                <Table.Thead>
                  <Table.Tr>
                    <Table.Th>{t("Parameter")}</Table.Th>
                    <Table.Th>{t("Type")}</Table.Th>
                    <Table.Th>{t("Required")}</Table.Th>
                    <Table.Th>{t("Description")}</Table.Th>
                  </Table.Tr>
                </Table.Thead>
                <Table.Tbody>
                  {tool.params.map((param) => (
                    <Table.Tr key={param.name}>
                      <Table.Td>
                        <Code>{param.name}</Code>
                      </Table.Td>
                      <Table.Td>
                        {param.enum?.length
                          ? param.enum.map(String).join(" | ")
                          : param.type}
                      </Table.Td>
                      <Table.Td>{param.required ? t("Yes") : t("No")}</Table.Td>
                      <Table.Td>
                        <Text size="xs" c="dimmed">
                          {param.description}
                        </Text>
                      </Table.Td>
                    </Table.Tr>
                  ))}
                </Table.Tbody>
              </Table>
            </Table.ScrollContainer>
          ) : (
            <Text size="sm" c="dimmed">
              {t("No parameters.")}
            </Text>
          )}
        </Stack>
      </Accordion.Panel>
    </Accordion.Item>
  );
}
