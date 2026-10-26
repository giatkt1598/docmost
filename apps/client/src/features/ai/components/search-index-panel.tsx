import {
  Alert,
  Badge,
  Button,
  Group,
  Paper,
  Progress,
  Stack,
  Text,
  Title,
} from "@mantine/core";
import { notifications } from "@mantine/notifications";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import {
  getSearchIndexStatus,
  rebuildSearchIndex,
} from "@/features/ai/services/ai-provider-service";

const KEY = ["search-index-status"];

// State of the semantic search index (embeddings of pages and files).
export function SearchIndexPanel() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const { data } = useQuery({
    queryKey: KEY,
    queryFn: getSearchIndexStatus,
    // follow the progress while the index is being built
    refetchInterval: (query) => (query.state.data?.busy ? 4000 : false),
  });

  const rebuild = useMutation({
    mutationFn: rebuildSearchIndex,
    onSuccess: (status) => {
      queryClient.setQueryData(KEY, status);
      notifications.show({ message: t("Rebuilding the search index") });
    },
    onError: (err: any) =>
      notifications.show({
        message: err?.response?.data?.message ?? String(err),
        color: "red",
      }),
  });

  if (!data) return null;

  const total = (data.pagesTotal ?? 0) + (data.attachmentsTotal ?? 0);
  const indexed = (data.pagesIndexed ?? 0) + (data.attachmentsIndexed ?? 0);
  const percent =
    total > 0 ? Math.min(100, Math.round((indexed / total) * 100)) : 100;

  return (
    <Paper withBorder radius="md" p="md">
      <Stack gap="sm">
        <Group justify="space-between">
          <Title order={5}>{t("Search index")}</Title>
          {data.configured && data.pgvector ? (
            <Badge color={data.busy ? "yellow" : "green"} variant="light">
              {data.busy ? t("Indexing") : t("Semantic search on")}
            </Badge>
          ) : (
            <Badge color="gray" variant="light">
              {t("Keyword search only")}
            </Badge>
          )}
        </Group>

        {!data.pgvector && (
          <Alert variant="light" color="yellow" p="xs">
            <Text size="xs">
              {t(
                "pgvector is not installed in the database, so semantic search is off. Keyword search keeps working.",
              )}
            </Text>
          </Alert>
        )}

        {data.pgvector && !data.configured && (
          <Text size="sm" c="dimmed">
            {t(
              "Choose an embedding model above to let search find related content by meaning.",
            )}
          </Text>
        )}

        {data.pgvector && data.configured && (
          <>
            <Text size="sm" c="dimmed">
              {t(
                "{{indexed}} of {{total}} pages and files indexed with {{model}}",
                {
                  indexed,
                  total,
                  model: data.model,
                },
              )}
            </Text>
            <Progress value={percent} animated={data.busy} />
            <Group>
              <Button
                variant="default"
                size="xs"
                onClick={() => rebuild.mutate()}
                loading={rebuild.isPending}
                disabled={data.busy}
              >
                {t("Rebuild index")}
              </Button>
            </Group>
          </>
        )}
      </Stack>
    </Paper>
  );
}
