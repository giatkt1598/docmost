import { useState } from "react";
import { ActionIcon, Anchor, Button, FileButton, Group, Stack, Text } from "@mantine/core";
import { IconPaperclip, IconUpload, IconX } from "@tabler/icons-react";
import { useTranslation } from "react-i18next";
import { uploadFile } from "@/features/page/services/page-service";
import { AttachedFile } from "@/features/base/types/base.types";
import { CellEditorProps } from "@/features/base/registry/property-types";
import { asFileList, fileUrl } from "@/features/base/utils/cell-values";
import { notifyBaseError } from "@/features/base/utils/errors";

const MAX_FILES = 100;

// Files of a cell: list, remove, upload (attached to the base page).
export function FileEditor({ value, pageId, save, cancel }: CellEditorProps) {
  const { t } = useTranslation();
  const [files, setFiles] = useState<AttachedFile[]>(asFileList(value));
  const [uploading, setUploading] = useState(false);

  const update = (next: AttachedFile[]) => {
    setFiles(next);
    save(next.length ? next : null);
  };

  const upload = async (picked: File[] | null) => {
    if (!picked?.length) return;
    setUploading(true);
    const added: AttachedFile[] = [];
    try {
      for (const file of picked) {
        const a = await uploadFile(file, pageId);
        added.push({
          id: a.id,
          fileName: a.fileName,
          mimeType: a.mimeType,
          fileSize: a.fileSize,
          url: `/api/files/${a.id}/${encodeURIComponent(a.fileName)}`,
        });
      }
    } catch (e) {
      notifyBaseError(e, t("Failed to upload file"));
    } finally {
      setUploading(false);
      if (added.length) update([...files, ...added].slice(0, MAX_FILES));
    }
  };

  return (
    <Stack
      gap="xs"
      w={300}
      onKeyDown={(e) => {
        e.stopPropagation();
        if (e.key === "Escape") cancel();
      }}
    >
      {files.length === 0 && (
        <Text size="sm" c="dimmed">
          {t("No files yet")}
        </Text>
      )}
      {files.map((f) => (
        <Group key={f.id} gap={6} wrap="nowrap" justify="space-between">
          <Group gap={6} wrap="nowrap" style={{ minWidth: 0 }}>
            <IconPaperclip size={14} style={{ flexShrink: 0 }} />
            <Anchor href={fileUrl(f)} target="_blank" rel="noopener noreferrer" size="sm" truncate>
              {f.fileName}
            </Anchor>
          </Group>
          <ActionIcon
            size="sm"
            variant="subtle"
            color="gray"
            aria-label={t("Remove")}
            onClick={() => update(files.filter((x) => x.id !== f.id))}
          >
            <IconX size={14} />
          </ActionIcon>
        </Group>
      ))}
      <FileButton onChange={upload} multiple>
        {(props) => (
          <Button
            {...props}
            size="compact-sm"
            variant="light"
            leftSection={<IconUpload size={14} />}
            loading={uploading}
            disabled={files.length >= MAX_FILES}
          >
            {t("Upload")}
          </Button>
        )}
      </FileButton>
    </Stack>
  );
}
