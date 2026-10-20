import { useState } from "react";
import { useAtom } from "jotai";
import { notifications } from "@mantine/notifications";
import { useTranslation } from "react-i18next";
import { workspaceAtom } from "@/features/user/atoms/current-user-atom.ts";
import { updateWorkspace } from "@/features/workspace/services/workspace-service.ts";
import { IWorkspace } from "@/features/workspace/types/workspace.types.ts";

// Saves workspace settings and keeps the workspace atom in sync.
export function useUpdateWorkspaceSetting() {
  const { t } = useTranslation();
  const [workspace, setWorkspace] = useAtom(workspaceAtom);
  const [saving, setSaving] = useState(false);

  const save = async (data: Partial<IWorkspace>): Promise<boolean> => {
    setSaving(true);
    try {
      const updated = await updateWorkspace(data);
      setWorkspace(updated);
      notifications.show({ message: t("Updated successfully") });
      return true;
    } catch (err: any) {
      notifications.show({
        message: err?.response?.data?.message ?? t("Failed to update setting"),
        color: "red",
      });
      return false;
    } finally {
      setSaving(false);
    }
  };

  return { workspace, save, saving };
}
