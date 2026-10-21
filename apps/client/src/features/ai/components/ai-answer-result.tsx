import { useEffect, useState } from "react";
import {
  Alert,
  Anchor,
  Badge,
  Box,
  Group,
  Loader,
  Paper,
  Stack,
  Text,
  Typography,
} from "@mantine/core";
import { IconFileText, IconSparkles } from "@tabler/icons-react";
import { Link, useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { buildPageUrl } from "@/features/page/page.utils.ts";
import { renderAiMarkdown } from "@/features/ai/render-ai-markdown";
import { IAiSource } from "@/features/ai/services/ai-answer-service";
import { AiAnswerState } from "@/features/ai/hooks/use-ai-answer";

interface AiAnswerResultProps {
  state: AiAnswerState;
  onNavigate: () => void;
}

function sourceUrl(source: IAiSource) {
  return buildPageUrl(source.spaceSlug, source.slugId, source.title);
}

// [1] in the answer becomes a link to that source page
function linkCitations(html: string, sources: IAiSource[]) {
  return html.replace(/\[(\d+)\]/g, (match, n) => {
    const source = sources.find((s) => s.index === Number(n));
    return source
      ? `<a href="${sourceUrl(source).replace(/"/g, "&quot;")}" data-citation="${n}">[${n}]</a>`
      : match;
  });
}

export function AiAnswerResult({ state, onNavigate }: AiAnswerResultProps) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [html, setHtml] = useState("");

  useEffect(() => {
    let cancelled = false;
    renderAiMarkdown(state.answer).then(
      (rendered) =>
        !cancelled && setHtml(linkCitations(rendered, state.sources)),
    );
    return () => {
      cancelled = true;
    };
  }, [state.answer, state.sources]);

  if (state.error) {
    return (
      <Alert color="red" variant="light" m="sm">
        {state.error}
      </Alert>
    );
  }

  if (state.found === false && !state.loading) {
    return (
      <Text size="sm" c="dimmed" ta="center" py="lg">
        {t("No pages you can access match this question.")}
      </Text>
    );
  }

  return (
    <Stack gap="sm" p="sm">
      <Paper withBorder radius="md" p="sm">
        <Group gap={6} mb={6}>
          <IconSparkles size={16} />
          <Text size="sm" fw={500}>
            {t("AI answer")}
          </Text>
        </Group>
        {state.answer ? (
          <Typography fz="sm">
            {/* internal citation links navigate inside the app */}
            <div
              onClick={(e) => {
                const link = (e.target as HTMLElement).closest(
                  "a[data-citation]",
                );
                if (!link) return;
                e.preventDefault();
                onNavigate();
                navigate(link.getAttribute("href"));
              }}
              dangerouslySetInnerHTML={{ __html: html }}
            />
          </Typography>
        ) : (
          <Group gap="xs">
            <Loader size="xs" />
            <Text size="sm" c="dimmed">
              {state.sources.length > 0
                ? t("Reading {{count}} pages...", {
                    count: state.sources.length,
                  })
                : t("Searching pages...")}
            </Text>
          </Group>
        )}
      </Paper>

      {state.sources.length > 0 && (
        <Box>
          <Text size="xs" c="dimmed" fw={500} mb={4}>
            {t("Sources")}
          </Text>
          <Stack gap={4}>
            {state.sources.map((source) => (
              <Anchor
                key={source.pageId}
                component={Link}
                to={sourceUrl(source)}
                onClick={onNavigate}
                underline="never"
                c="var(--mantine-color-text)"
              >
                <Paper withBorder radius="sm" px="sm" py={6}>
                  <Group gap="xs" wrap="nowrap">
                    <Badge size="xs" variant="light" circle>
                      {source.index}
                    </Badge>
                    <IconFileText size={14} style={{ flexShrink: 0 }} />
                    <Text size="sm" fw={500} truncate>
                      {source.title || t("Untitled")}
                    </Text>
                  </Group>
                  {source.excerpt && (
                    <Text size="xs" c="dimmed" lineClamp={2} mt={2}>
                      {source.excerpt}
                    </Text>
                  )}
                </Paper>
              </Anchor>
            ))}
          </Stack>
        </Box>
      )}
    </Stack>
  );
}
