import { useEffect, useState } from "react";
import {
  Alert,
  Badge,
  Box,
  Group,
  Loader,
  Paper,
  Text,
  Typography,
} from "@mantine/core";
import {
  IconAlertTriangle,
  IconCheck,
  IconFilePlus,
  IconFileText,
  IconListTree,
  IconPencil,
  IconSearch,
  IconStack2,
  IconX,
} from "@tabler/icons-react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { renderAiMarkdown } from "@/features/ai/render-ai-markdown";
import {
  IChatMessage,
  IChatToolCall,
} from "@/features/ai-chat/types/ai-chat.types";

const TOOL_ICONS: Record<string, React.ReactNode> = {
  search_pages: <IconSearch size={12} />,
  get_page: <IconFileText size={12} />,
  list_spaces: <IconStack2 size={12} />,
  list_child_pages: <IconListTree size={12} />,
  create_page: <IconFilePlus size={12} />,
  update_page: <IconPencil size={12} />,
};

function ToolChip({ call }: { call: IChatToolCall }) {
  const { t } = useTranslation();
  const label =
    call.name === "search_pages"
      ? t("Searched “{{query}}”", { query: call.input?.query ?? "" })
      : call.name === "get_page"
        ? t("Read a page")
        : call.name === "list_spaces"
          ? t("Listed spaces")
          : call.name === "list_child_pages"
            ? t("Listed pages")
            : call.name === "create_page"
              ? t("Created page “{{title}}”", {
                  title: call.input?.title ?? "",
                })
              : call.name === "update_page"
                ? t("Updated a page")
                : call.name;
  return (
    <Badge
      variant="light"
      color={call.ok === false ? "red" : "gray"}
      leftSection={TOOL_ICONS[call.name]}
      rightSection={
        call.ok === undefined ? (
          <Loader size={10} />
        ) : call.ok ? (
          <IconCheck size={12} />
        ) : (
          <IconX size={12} />
        )
      }
      tt="none"
      fw={400}
    >
      {label}
    </Badge>
  );
}

export function ChatMessage({
  message,
  streaming,
}: {
  message: IChatMessage;
  streaming?: boolean;
}) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [html, setHtml] = useState("");

  useEffect(() => {
    if (message.role !== "assistant") return;
    let cancelled = false;
    renderAiMarkdown(message.content).then((h) => !cancelled && setHtml(h));
    return () => {
      cancelled = true;
    };
  }, [message.content, message.role]);

  if (message.role === "user") {
    return (
      <Group justify="flex-end">
        <Paper
          radius="lg"
          px="md"
          py={8}
          maw="85%"
          bg="var(--mantine-color-default-hover)"
        >
          <Text size="sm" style={{ whiteSpace: "pre-wrap" }}>
            {message.content}
          </Text>
        </Paper>
      </Group>
    );
  }

  return (
    <Box>
      {!!message.toolCalls?.length && (
        <Group gap={6} mb={6}>
          {message.toolCalls.map((call) => (
            <ToolChip key={call.id} call={call} />
          ))}
        </Group>
      )}
      {message.content ? (
        <Typography fz="sm">
          {/* links to pages navigate inside the app */}
          <div
            onClick={(e) => {
              const link = (e.target as HTMLElement).closest("a");
              const href = link?.getAttribute("href");
              if (href?.startsWith("/")) {
                e.preventDefault();
                navigate(href);
              }
            }}
            dangerouslySetInnerHTML={{ __html: html }}
          />
        </Typography>
      ) : (
        streaming &&
        !message.error && (
          <Group gap="xs">
            <Loader size="xs" type="dots" />
            <Text size="sm" c="dimmed">
              {message.toolCalls?.length
                ? t("Reading pages...")
                : t("Thinking...")}
            </Text>
          </Group>
        )
      )}
      {message.error && (
        <Alert
          color="red"
          variant="light"
          mt="xs"
          p="xs"
          icon={<IconAlertTriangle size={16} />}
        >
          <Text size="sm">{message.error}</Text>
        </Alert>
      )}
    </Box>
  );
}
