import { useState } from "react";
import { Button, Checkbox, FileInput, Group, Modal, Stack, Text } from "@mantine/core";
import { IconFileTypeCsv } from "@tabler/icons-react";
import { notifications } from "@mantine/notifications";
import { useTranslation } from "react-i18next";
import { useImportCsvMutation } from "@/features/base/queries/base-row-query";

type Props = { pageId: string; opened: boolean; onClose: () => void };

const MAX_BYTES = 20 * 1024 * 1024;

export function CsvImportModal({ pageId, opened, onClose }: Props) {
  const { t } = useTranslation();
  const [file, setFile] = useState<File | null>(null);
  const [createMissing, setCreateMissing] = useState(true);
  const importCsv = useImportCsvMutation(pageId);
  const tooBig = !!file && file.size > MAX_BYTES;

  const close = () => {
    setFile(null);
    onClose();
  };

  const submit = async () => {
    if (!file) return;
    const result = await importCsv.mutateAsync({ file, createMissing });
    const parts = [t("{{count}} rows imported", { count: result.imported })];
    if (result.createdProperties.length) {
      parts.push(t("New properties: {{names}}", { names: result.createdProperties.join(", ") }));
    }
    if (result.skippedColumns.length) {
      parts.push(t("Skipped columns: {{names}}", { names: result.skippedColumns.join(", ") }));
    }
    notifications.show({ title: t("Import finished"), message: parts.join(" · ") });
    close();
  };

  return (
    <Modal opened={opened} onClose={close} title={t("Import CSV")} centered>
      <Stack>
        <Text size="sm" c="dimmed">
          {t("Rows are added to this base. The first line must hold the column names.")}
        </Text>
        <FileInput
          accept=".csv,text/csv"
          leftSection={<IconFileTypeCsv size={16} />}
          placeholder={t("Choose a .csv file")}
          value={file}
          onChange={setFile}
          clearable
          error={tooBig ? t("The CSV file is larger than 20 MB") : undefined}
        />
        <Checkbox
          label={t("Create properties for columns that do not exist")}
          checked={createMissing}
          onChange={(e) => setCreateMissing(e.currentTarget.checked)}
        />
        <Group justify="flex-end">
          <Button variant="default" onClick={close}>
            {t("Cancel")}
          </Button>
          <Button onClick={submit} disabled={!file || tooBig} loading={importCsv.isPending}>
            {t("Import")}
          </Button>
        </Group>
      </Stack>
    </Modal>
  );
}
