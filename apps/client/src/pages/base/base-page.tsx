import { Box, Title } from "@mantine/core";
import { useParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { DocumentTitle } from "@/components/ui/document-title.tsx";
import { BaseWorkspace } from "@/features/base/components/shell/base-workspace";
import { PageWidthContainer } from "@/features/base/components/common/page-width-container";
import { useBaseInfoQuery } from "@/features/base/queries/base-query";

// Standalone base page (/base/:pageId).
export default function BasePage() {
  const { t } = useTranslation();
  const { pageId } = useParams();
  const { data: base } = useBaseInfoQuery(pageId);
  const name = base?.name?.trim() || t("Untitled base");

  if (!pageId) return null;
  return (
    <Box
      className="base-page-root"
      pt="sm"
      style={{ display: "flex", flexDirection: "column" }}
    >
      <DocumentTitle title={`${base?.icon || ""} ${name}`.trim()} withAppName={false} />
      <PageWidthContainer fill>
        <BaseWorkspace
          pageId={pageId}
          editable
          fill
          title={
            <Title order={3} fw={600} style={{ whiteSpace: "nowrap" }}>
              {base?.icon ? `${base.icon} ` : ""}
              {name}
            </Title>
          }
        />
      </PageWidthContainer>
    </Box>
  );
}
