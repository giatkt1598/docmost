import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { notifications } from "@mantine/notifications";
import {
  addPagePermissions,
  getPagePermissions,
  getPageRestrictionInfo,
  removePagePermissions,
  restrictPage,
  unrestrictPage,
  updatePagePermissionRole,
} from "@/features/page-permission/services/page-permission-service";

export const pageRestrictionKey = (pageId: string) => [
  "page-restriction",
  pageId,
];
export const pagePermissionsKey = (pageId: string) => [
  "page-permissions",
  pageId,
];

export function usePageRestrictionInfoQuery(pageId: string | undefined) {
  return useQuery({
    queryKey: pageRestrictionKey(pageId),
    queryFn: () => getPageRestrictionInfo(pageId),
    enabled: !!pageId,
  });
}

export function usePagePermissionsQuery(
  pageId: string | undefined,
  enabled = true,
) {
  return useQuery({
    queryKey: pagePermissionsKey(pageId),
    queryFn: () => getPagePermissions(pageId),
    enabled: !!pageId && enabled,
  });
}

// Restriction changes also affect the page's own permissions, the page
// tree and the restriction state of descendants, so refresh broadly.
function usePagePermissionMutation<T extends { pageId: string }>(
  mutationFn: (data: T) => Promise<void>,
) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["page-restriction"] });
      queryClient.invalidateQueries({ queryKey: ["page-permissions"] });
      queryClient.invalidateQueries({ queryKey: ["pages"] });
      queryClient.invalidateQueries({ queryKey: ["root-sidebar-pages"] });
      queryClient.invalidateQueries({ queryKey: ["sidebar-pages"] });
      queryClient.invalidateQueries({ queryKey: ["share-for-page"] });
    },
    onError: (error: any) => {
      notifications.show({
        message: error?.response?.data?.message ?? error?.message,
        color: "red",
      });
    },
  });
}

export const useRestrictPageMutation = () =>
  usePagePermissionMutation(({ pageId }: { pageId: string }) =>
    restrictPage(pageId),
  );

export const useUnrestrictPageMutation = () =>
  usePagePermissionMutation(({ pageId }: { pageId: string }) =>
    unrestrictPage(pageId),
  );

export const useAddPagePermissionsMutation = () =>
  usePagePermissionMutation(addPagePermissions);

export const useRemovePagePermissionsMutation = () =>
  usePagePermissionMutation(removePagePermissions);

export const useUpdatePagePermissionRoleMutation = () =>
  usePagePermissionMutation(updatePagePermissionRole);
