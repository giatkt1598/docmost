import { useState } from "react";
import {
  ActionIcon,
  Box,
  Button,
  Menu,
  NavLink,
  ScrollArea,
  Stack,
  Text,
  TextInput,
} from "@mantine/core";
import { modals } from "@mantine/modals";
import { useDebouncedValue } from "@mantine/hooks";
import {
  IconDots,
  IconMessage,
  IconPencil,
  IconPlus,
  IconSearch,
  IconTrash,
} from "@tabler/icons-react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import {
  useAiChatsQuery,
  useDeleteAiChatMutation,
  useRenameAiChatMutation,
} from "@/features/ai-chat/queries/ai-chat-query";
import { IAiChat } from "@/features/ai-chat/types/ai-chat.types";

// Navbar of /ai: start a chat and switch between the user's chats.
export function AiChatSidebar() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { chatId } = useParams();
  const [search, setSearch] = useState("");
  const [debounced] = useDebouncedValue(search, 300);
  const { data: chats = [], isLoading } = useAiChatsQuery(debounced);
  const rename = useRenameAiChatMutation();
  const remove = useDeleteAiChatMutation();

  const openRename = (chat: IAiChat) => {
    let title = chat.title ?? "";
    modals.openConfirmModal({
      title: t("Rename chat"),
      children: (
        <TextInput
          defaultValue={title}
          data-autofocus
          onChange={(e) => (title = e.currentTarget.value)}
        />
      ),
      labels: { confirm: t("Save"), cancel: t("Cancel") },
      onConfirm: () =>
        title.trim() && rename.mutate({ chatId: chat.id, title: title.trim() }),
    });
  };

  const confirmDelete = (chat: IAiChat) =>
    modals.openConfirmModal({
      title: t("Delete chat"),
      children: (
        <Text size="sm">
          {t("“{{title}}” will be deleted.", { title: chat.title })}
        </Text>
      ),
      labels: { confirm: t("Delete"), cancel: t("Cancel") },
      confirmProps: { color: "red" },
      onConfirm: () =>
        remove.mutate(chat.id, {
          onSuccess: () => chat.id === chatId && navigate("/ai"),
        }),
    });

  return (
    <Stack gap="sm" p="sm" h="100%">
      <Button
        component={Link}
        to="/ai"
        leftSection={<IconPlus size={16} />}
        variant="default"
        fullWidth
      >
        {t("New chat")}
      </Button>
      <TextInput
        size="xs"
        leftSection={<IconSearch size={14} />}
        placeholder={t("Search chats")}
        value={search}
        onChange={(e) => setSearch(e.currentTarget.value)}
      />
      <ScrollArea style={{ flex: 1 }} type="auto">
        {!isLoading && chats.length === 0 && (
          <Text size="xs" c="dimmed" ta="center" py="md">
            {search ? t("No chats found") : t("No chats yet")}
          </Text>
        )}
        {chats.map((chat) => (
          <NavLink
            key={chat.id}
            component={Link}
            to={`/ai/chat/${chat.id}`}
            active={chat.id === chatId}
            label={chat.title || t("New chat")}
            leftSection={<IconMessage size={16} />}
            styles={{ label: { overflow: "hidden", textOverflow: "ellipsis" } }}
            rightSection={
              <Box onClick={(e) => e.preventDefault()}>
                <Menu position="bottom-end" withinPortal>
                  <Menu.Target>
                    <ActionIcon
                      size="sm"
                      variant="subtle"
                      color="gray"
                      aria-label={t("Chat actions")}
                    >
                      <IconDots size={14} />
                    </ActionIcon>
                  </Menu.Target>
                  <Menu.Dropdown>
                    <Menu.Item
                      leftSection={<IconPencil size={14} />}
                      onClick={() => openRename(chat)}
                    >
                      {t("Rename")}
                    </Menu.Item>
                    <Menu.Item
                      color="red"
                      leftSection={<IconTrash size={14} />}
                      onClick={() => confirmDelete(chat)}
                    >
                      {t("Delete")}
                    </Menu.Item>
                  </Menu.Dropdown>
                </Menu>
              </Box>
            }
          />
        ))}
      </ScrollArea>
    </Stack>
  );
}

export default AiChatSidebar;
