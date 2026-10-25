import { useTranslation } from "react-i18next";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useMutation } from "@tanstack/react-query";
import { Affix, Button } from "@mantine/core";
import { notifications } from "@mantine/notifications";
import { IconFileText } from "@tabler/icons-react";
import { buildPageUrl } from "@/features/page/page.utils";
import { openRowPage } from "@/features/base-tools/services/base-tools-service";

// While a row dialog is open (?row=…&rowBase=…), offers to open the row's
// own page, creating it on first use.
export function RowPageButton() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const rowId = searchParams.get("row");
  const baseId = searchParams.get("rowBase");

  const mutation = useMutation({
    mutationFn: () => openRowPage(baseId!, rowId!),
    onSuccess: (page) => {
      if (!page.spaceSlug) return;
      navigate(
        buildPageUrl(page.spaceSlug, page.slugId, page.title ?? undefined),
      );
    },
    onError: (err: any) => {
      notifications.show({
        color: "red",
        message:
          err?.response?.status === 403
            ? t("This row has no page yet")
            : t("Failed to open the row page"),
      });
    },
  });

  if (!rowId || !baseId) return null;
  return (
    <Affix position={{ bottom: 24, right: 24 }} zIndex={1000}>
      <Button
        leftSection={<IconFileText size={16} />}
        loading={mutation.isPending}
        onClick={() => mutation.mutate()}
      >
        {t("Open row page")}
      </Button>
    </Affix>
  );
}
