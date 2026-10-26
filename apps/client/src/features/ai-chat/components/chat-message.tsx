import { useEffect, useState } from "react";
import {
  Alert,
  Badge,
  Box,
  Button,
  Group,
  Loader,
  Paper,
  Text,
  Typography,
} from "@mantine/core";
import {
  IconAlertTriangle,
  IconArrowBackUp,
  IconCheck,
  IconHistory,
  IconFilePlus,
  IconFileText,
  IconListTree,
  IconPencil,
  IconSearch,
  IconStack2,
  IconX,
} from "@tabler/icons-react";
import { useNavigate } from "react-router-dom";
import { useSetAtom } from "jotai";
import { modals } from "@mantine/modals";
import { notifications } from "@mantine/notifications";
import { useMutation } from "@tanstack/react-query";
import { historyAtoms } from "@/features/page-history/atoms/history-atoms.ts";
import { undoAiPageEdit } from "@/features/ai-chat/services/ai-chat-service";
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
  get_page_outline: <IconListTree size={12} />,
  get_blocks: <IconFileText size={12} />,
  find_blocks: <IconSearch size={12} />,
  apply_operations: <IconPencil size={12} />,
  insert_blocks: <IconPencil size={12} />,
  update_block: <IconPencil size={12} />,
  move_block: <IconPencil size={12} />,
  delete_blocks: <IconPencil size={12} />,
  undo_ai_edit: <IconArrowBackUp size={12} />,
};

const PAGE_EDIT_TOOLS = new Set([
  "apply_operations",
  "insert_blocks",
  "update_block",
  "move_block",
  "delete_blocks",
]);

// Summary of an AI page edit with its Undo and "View changes".
function EditActions({
  call,
  canViewHistory,
}: {
  call: IChatToolCall;
  canViewHistory?: boolean;
}) {
  const { t } = useTranslation();
  const [undone, setUndone] = useState(false);
  const openHistory = useSetAtom(historyAtoms);
  const undo = useMutation({
    mutationFn: () => undoAiPageEdit(call.editId),
    onSuccess: () => {
      setUndone(true);
      notifications.show({ message: t("AI edit undone") });
    },
    onError: (err: any) =>
      notifications.show({
        color: "red",
        message: err?.response?.data?.message ?? err?.message,
      }),
  });

  const confirmUndo = () =>
    modals.openConfirmModal({
      title: t("Undo this AI edit?"),
      children: (
        <Text size="sm">
          {t(
            "Only the blocks this edit changed are put back. If someone changed them since, the undo is refused.",
          )}
        </Text>
      ),
      labels: { confirm: t("Undo"), cancel: t("Cancel") },
      onConfirm: () => undo.mutate(),
    });

  return (
    <Group gap={4} wrap="nowrap" mt={4}>
      <Text size="xs" c="dimmed" lineClamp={1} style={{ flex: 1 }}>
        {call.input?.summary}
      </Text>
      {undone ? (
        <Text size="xs" c="dimmed">
          {t("Undone")}
        </Text>
      ) : (
        <Button
          size="compact-xs"
          variant="subtle"
          leftSection={<IconArrowBackUp size={12} />}
          onClick={confirmUndo}
          loading={undo.isPending}
        >
          {t("Undo")}
        </Button>
      )}
      {canViewHistory && (
        <Button
          size="compact-xs"
          variant="subtle"
          color="gray"
          leftSection={<IconHistory size={12} />}
          onClick={() => openHistory(true)}
        >
          {t("View changes")}
        </Button>
      )}
    </Group>
  );
}

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
                : call.name === "get_page_outline"
                  ? t("Read the page outline")
                  : call.name === "get_blocks"
                    ? t("Read blocks")
                    : call.name === "find_blocks"
                      ? t("Searched the page for “{{query}}”", {
                          query: call.input?.query ?? "",
                        })
                      : PAGE_EDIT_TOOLS.has(call.name)
                        ? t("Edited the page")
                        : call.name === "undo_ai_edit"
                          ? t("Undid an AI edit")
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
  compact,
}: {
  message: IChatMessage;
  streaming?: boolean;
  // beside a page, on the tinted side panel
  compact?: boolean;
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
          // the side panel is tinted like the default-hover colour, so the
          // block needs the page background and an outline to stand out there
          bg={
            compact
              ? "var(--mantine-color-body)"
              : "var(--mantine-color-default-hover)"
          }
          withBorder={compact}
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
      {message.toolCalls
        ?.filter((call) => call.editId && PAGE_EDIT_TOOLS.has(call.name))
        .map((call) => (
          <EditActions
            key={`edit-${call.id}`}
            call={call}
            canViewHistory={compact}
          />
        ))}
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
