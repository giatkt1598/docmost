import {
  keepPreviousData,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { notifications } from "@mantine/notifications";
import { useTranslation } from "react-i18next";
import {
  createMcpToken,
  getAllMcpTokens,
  getMcpServerInfo,
  getMcpTokens,
  getMcpTools,
  revokeMcpToken,
} from "@/features/mcp/services/mcp-token-service";
import { ICreateMcpToken } from "@/features/mcp/types/mcp-token.types";

const MCP_TOKENS_KEY = "mcp-tokens";
const ALL_MCP_TOKENS_KEY = "mcp-tokens-all";
const MCP_SERVER_INFO_KEY = "mcp-server-info";

export function useMcpServerInfoQuery() {
  return useQuery({
    queryKey: [MCP_SERVER_INFO_KEY],
    queryFn: getMcpServerInfo,
    staleTime: 5 * 60_000,
  });
}

export function useMcpToolsQuery(enabled = true) {
  return useQuery({
    queryKey: ["mcp-tools"],
    queryFn: getMcpTools,
    staleTime: 5 * 60_000,
    enabled,
  });
}

export function useMcpTokensQuery(enabled = true) {
  return useQuery({
    queryKey: [MCP_TOKENS_KEY],
    queryFn: getMcpTokens,
    enabled,
  });
}

// every token of the workspace (admins)
export function useAllMcpTokensQuery(cursor?: string) {
  return useQuery({
    queryKey: [ALL_MCP_TOKENS_KEY, cursor],
    queryFn: () => getAllMcpTokens({ cursor }),
    placeholderData: keepPreviousData,
  });
}

export function useCreateMcpTokenMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: ICreateMcpToken) => createMcpToken(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [MCP_TOKENS_KEY] });
      queryClient.invalidateQueries({ queryKey: [ALL_MCP_TOKENS_KEY] });
    },
    onError: (error: any) => {
      notifications.show({
        message: error?.response?.data?.message ?? error.message,
        color: "red",
      });
    },
  });
}

export function useRevokeMcpTokenMutation() {
  const queryClient = useQueryClient();
  const { t } = useTranslation();
  return useMutation({
    mutationFn: (tokenId: string) => revokeMcpToken(tokenId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [MCP_TOKENS_KEY] });
      queryClient.invalidateQueries({ queryKey: [ALL_MCP_TOKENS_KEY] });
      notifications.show({ message: t("Token revoked") });
    },
    onError: (error: any) => {
      notifications.show({
        message: error?.response?.data?.message ?? error.message,
        color: "red",
      });
    },
  });
}
