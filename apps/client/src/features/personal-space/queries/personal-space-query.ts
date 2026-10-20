import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  createPersonalSpace,
  getPersonalSpace,
} from "@/features/personal-space/services/personal-space-service";

export const PERSONAL_SPACE_KEY = ["personal-space"];

export function usePersonalSpaceQuery() {
  return useQuery({
    queryKey: PERSONAL_SPACE_KEY,
    queryFn: getPersonalSpace,
    staleTime: 5 * 60 * 1000,
  });
}

export function useCreatePersonalSpaceMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: createPersonalSpace,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: PERSONAL_SPACE_KEY });
      queryClient.invalidateQueries({ queryKey: ["spaces"] });
    },
  });
}
