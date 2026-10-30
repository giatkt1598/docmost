import { useAtomValue } from "jotai";
import { workspaceAtom } from "@/features/user/atoms/current-user-atom.ts";
import useUserRole from "@/hooks/use-user-role.tsx";

// Matches TemplateAccessService on the server, which has the final say.
export function useCanCreateTemplates(): boolean {
  const { isAdmin } = useUserRole();
  const workspace = useAtomValue(workspaceAtom);
  return isAdmin || workspace?.settings?.templates?.allowMemberTemplates === true;
}
