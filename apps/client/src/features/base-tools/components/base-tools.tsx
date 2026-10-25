import { Group } from "@mantine/core";
import { BaseQuickSearch } from "@/features/base-tools/components/base-quick-search";
import { BaseCsvImport } from "@/features/base-tools/components/base-csv-import";

// Quick search and CSV import, shown next to the title of a base page.
export function BaseTools({
  pageId,
  editable,
}: {
  pageId: string;
  editable: boolean;
}) {
  return (
    <Group gap="xs" wrap="nowrap">
      <BaseQuickSearch pageId={pageId} />
      {editable && <BaseCsvImport pageId={pageId} />}
    </Group>
  );
}
