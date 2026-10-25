import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useMutation } from "@tanstack/react-query";
import {
  Button,
  Checkbox,
  FileInput,
  Group,
  Modal,
  Stack,
  Text,
} from "@mantine/core";
import { useDisclosure } from "@mantine/hooks";
import { notifications } from "@mantine/notifications";
import { IconFileImport } from "@tabler/icons-react";
import { queryClient } from "@/main";
import { importBaseCsv } from "@/features/base-tools/services/base-tools-service";

// Appends the rows of a CSV file to the base.
export function BaseCsvImport({ pageId }: { pageId: string }) {
  const { t } = useTranslation();
  const [opened, { open, close }] = useDisclosure(false);
  const [file, setFile] = useState<File | null>(null);
  const [createMissing, setCreateMissing] = useState(true);

  const mutation = useMutation({
    mutationFn: () => importBaseCsv(pageId, file!, createMissing),
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ["base-rows", pageId] });
      queryClient.invalidateQueries({ queryKey: ["bases", pageId] });
      const skipped = result.skippedColumns.length
        ? " " +
          t("Skipped columns: {{names}}", {
            names: result.skippedColumns.join(", "),
          })
        : "";
      notifications.show({
        message:
          t("{{count}} rows imported", { count: result.imported }) + skipped,
      });
      setFile(null);
      close();
    },
    onError: (err: any) => {
      notifications.show({
        color: "red",
        message: err?.response?.data?.message ?? t("Failed to import the file"),
      });
    },
  });

  return (
    <>
      <Button
        size="xs"
        variant="default"
        leftSection={<IconFileImport size={14} />}
        onClick={open}
      >
        {t("Import CSV")}
      </Button>
      <Modal opened={opened} onClose={close} title={t("Import CSV")} centered>
        <Stack gap="sm">
          <Text size="sm" c="dimmed">
            {t(
              "The first row must hold column names. Columns are matched to properties by name; rows are added to the end of the base.",
            )}
          </Text>
          <FileInput
            accept=".csv,text/csv"
            placeholder={t("Choose a .csv file")}
            value={file}
            onChange={setFile}
            clearable
          />
          <Checkbox
            checked={createMissing}
            onChange={(e) => setCreateMissing(e.currentTarget.checked)}
            label={t("Create text properties for unknown columns")}
          />
          <Group justify="flex-end">
            <Button variant="default" onClick={close}>
              {t("Cancel")}
            </Button>
            <Button
              disabled={!file}
              loading={mutation.isPending}
              onClick={() => mutation.mutate()}
            >
              {t("Import")}
            </Button>
          </Group>
        </Stack>
      </Modal>
    </>
  );
}
