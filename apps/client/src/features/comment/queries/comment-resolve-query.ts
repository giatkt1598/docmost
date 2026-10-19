import {
  InfiniteData,
  useMutation,
  useQueryClient,
} from "@tanstack/react-query";
import { notifications } from "@mantine/notifications";
import { useTranslation } from "react-i18next";
import { setCommentResolved } from "@/features/comment/services/comment-service";
import { IComment } from "@/features/comment/types/comment.types";
import { RQ_KEY } from "@/features/comment/queries/comment-query";
import { IPagination } from "@/lib/types.ts";

export function useSetCommentResolvedMutation() {
  const queryClient = useQueryClient();
  const { t } = useTranslation();

  return useMutation({
    mutationFn: (data: {
      commentId: string;
      pageId: string;
      resolved: boolean;
    }) =>
      setCommentResolved({
        commentId: data.commentId,
        resolved: data.resolved,
      }),
    onSuccess: (comment: IComment, variables) => {
      const cache = queryClient.getQueryData(RQ_KEY(variables.pageId)) as
        | InfiniteData<IPagination<IComment>>
        | undefined;
      if (!cache) return;

      queryClient.setQueryData(RQ_KEY(variables.pageId), {
        ...cache,
        pages: cache.pages.map((page) => ({
          ...page,
          items: page.items.map((item) =>
            item.id === comment.id ? comment : item,
          ),
        })),
      });
    },
    onError: () => {
      notifications.show({
        message: t("Failed to resolve comment"),
        color: "red",
      });
    },
  });
}
