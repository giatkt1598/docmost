import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { notifications } from "@mantine/notifications";
import {
  deleteAiChat,
  getAiChats,
  renameAiChat,
} from "@/features/ai-chat/services/ai-chat-service";

export const AI_CHATS_KEY = "ai-chats";

// pageId: only the chats started beside that page
export function useAiChatsQuery(
  query?: string,
  pageId?: string,
  enabled = true,
) {
  return useQuery({
    queryKey: [AI_CHATS_KEY, query ?? "", pageId ?? null],
    queryFn: () => getAiChats(query, pageId),
    enabled,
  });
}

function useChatMutation<TVars>(mutationFn: (vars: TVars) => Promise<any>) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn,
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: [AI_CHATS_KEY] }),
    onError: (error: any) =>
      notifications.show({
        message: error?.response?.data?.message ?? error?.message,
        color: "red",
      }),
  });
}

export const useRenameAiChatMutation = () => useChatMutation(renameAiChat);
export const useDeleteAiChatMutation = () => useChatMutation(deleteAiChat);
