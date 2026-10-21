import { FC } from "react";
import { Button } from "@mantine/core";
import { IconSparkles } from "@tabler/icons-react";
import { useSetAtom } from "jotai";
import { useTranslation } from "react-i18next";
import {
  aiMenuAnchorAtom,
  anchorOf,
  showAiMenuAtom,
} from "@/features/editor/atoms/editor-atoms";

export const AskAiGroup: FC = () => {
  const { t } = useTranslation();
  const setShowAiMenu = useSetAtom(showAiMenuAtom);
  const setAiMenuAnchor = useSetAtom(aiMenuAnchorAtom);

  return (
    <Button
      variant="subtle"
      color="dark"
      size="xs"
      leftSection={<IconSparkles size={14} />}
      onClick={(e) => {
        setAiMenuAnchor(anchorOf(e.currentTarget));
        setShowAiMenu(true);
      }}
    >
      {t("Ask AI")}
    </Button>
  );
};
