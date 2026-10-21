import { useMemo, useState } from "react";
import {
  Accordion,
  Anchor,
  Button,
  Center,
  Code,
  Group,
  List,
  Loader,
  Paper,
  Stack,
  Text,
  TextInput,
  Title,
} from "@mantine/core";
import { IconDownload, IconSearch } from "@tabler/icons-react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import api from "@/lib/api-client";
import SettingsTitle from "@/components/settings/settings-title";
import { DocumentTitle } from "@/components/ui/document-title.tsx";
import { IOpenApiSpec } from "@/features/api-docs/types/api-docs.types";
import { operationsFromSpec } from "@/features/api-docs/api-docs.utils";
import { ApiEndpoint } from "@/features/api-docs/components/api-endpoint";

async function getOpenApiSpec(): Promise<IOpenApiSpec> {
  // served as a plain document, so the client interceptor returns it as is
  return (await api.get("/api-docs/openapi.json")) as unknown as IOpenApiSpec;
}

function downloadSpec(spec: IOpenApiSpec) {
  const blob = new Blob([JSON.stringify(spec, null, 2)], {
    type: "application/json",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "docmost-openapi.json";
  a.click();
  URL.revokeObjectURL(url);
}

export default function ApiDocs() {
  const { t } = useTranslation();
  const [query, setQuery] = useState("");
  const { data: spec, isLoading } = useQuery({
    queryKey: ["openapi-spec"],
    queryFn: getOpenApiSpec,
    staleTime: Infinity,
  });

  const baseUrl = spec?.servers?.[0]?.url ?? window.location.origin;
  const groups = useMemo(() => {
    if (!spec) return [];
    const q = query.trim().toLowerCase();
    const byTag = new Map<string, ReturnType<typeof operationsFromSpec>>();
    for (const op of operationsFromSpec(spec)) {
      if (
        q &&
        !op.path.toLowerCase().includes(q) &&
        !op.summary.toLowerCase().includes(q)
      ) {
        continue;
      }
      byTag.set(op.tag, [...(byTag.get(op.tag) ?? []), op]);
    }
    return [...byTag.entries()].sort(([a], [b]) => a.localeCompare(b));
  }, [spec, query]);

  return (
    <>
      <DocumentTitle title={t("API documentation")} />
      <SettingsTitle title={t("API documentation")} />

      <Paper withBorder p="md" radius="md" mb="lg">
        <Stack gap="xs">
          <Text size="sm">
            {t(
              "The API is RPC-style: almost every endpoint is a POST with a JSON body. Requests act as the owner of the API key, with their permissions.",
            )}
          </Text>
          <List size="sm" spacing={4}>
            <List.Item>
              {t("Base URL")}: <Code>{baseUrl}</Code>
            </List.Item>
            <List.Item>
              {t("Authentication")}:{" "}
              <Code>Authorization: Bearer &lt;API key&gt;</Code> —{" "}
              <Anchor
                component={Link}
                to="/settings/account/api-keys"
                size="sm"
              >
                {t("create an API key")}
              </Anchor>
            </List.Item>
            <List.Item>
              {t("Responses are wrapped as")}{" "}
              <Code>{"{ data, success, status }"}</Code>
            </List.Item>
            <List.Item>
              {t("Lists use cursor pagination")}: <Code>limit</Code>,{" "}
              <Code>cursor</Code> → <Code>{"data.meta.nextCursor"}</Code>
            </List.Item>
            <List.Item>
              {t("Errors")}: <Code>400</Code> {t("invalid body")},{" "}
              <Code>401</Code> {t("missing, invalid or revoked key")},{" "}
              <Code>403</Code> {t("not allowed")}, <Code>404</Code>{" "}
              {t("not found")}
            </List.Item>
          </List>
          <Group mt="xs">
            <Button
              size="xs"
              variant="default"
              leftSection={<IconDownload size={14} />}
              disabled={!spec}
              onClick={() => spec && downloadSpec(spec)}
            >
              {t("Download OpenAPI spec")}
            </Button>
            <Text size="xs" c="dimmed">
              {t(
                "Import it into Postman, Insomnia or an OpenAPI client generator.",
              )}
            </Text>
          </Group>
        </Stack>
      </Paper>

      <TextInput
        placeholder={t("Search endpoints")}
        leftSection={<IconSearch size={16} />}
        value={query}
        onChange={(e) => setQuery(e.currentTarget.value)}
        mb="md"
      />

      {isLoading ? (
        <Center py="xl">
          <Loader size="sm" />
        </Center>
      ) : groups.length === 0 ? (
        <Text size="sm" c="dimmed" ta="center" py="lg">
          {t("No endpoints match your search.")}
        </Text>
      ) : (
        <Stack gap="lg">
          {groups.map(([tag, ops]) => (
            <div key={tag}>
              <Title order={4} mb="xs">
                {tag}
              </Title>
              <Accordion variant="separated" chevronPosition="right">
                {ops.map((op) => (
                  <ApiEndpoint key={op.operationId} op={op} baseUrl={baseUrl} />
                ))}
              </Accordion>
            </div>
          ))}
        </Stack>
      )}
    </>
  );
}
