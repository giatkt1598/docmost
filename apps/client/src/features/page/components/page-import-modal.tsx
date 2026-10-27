import {
  Modal,
  Button,
  SimpleGrid,
  FileButton,
  Group,
  Text,
  TextInput,
  Checkbox,
  Stack,
  Tooltip,
} from "@mantine/core";
import {
  IconBrandNotion,
  IconCheck,
  IconFileCode,
  IconFileTypeDocx,
  IconFileTypePdf,
  IconFileTypeZip,
  IconMarkdown,
  IconWorldWww,
  IconX,
} from "@tabler/icons-react";
import {
  importPage,
  importWebPage,
  importZip,
} from "@/features/page/services/page-service.ts";
import { notifications } from "@mantine/notifications";
import { treeDataAtom } from "@/features/page/tree/atoms/tree-data-atom.ts";
import { useAtom } from "jotai";
import { buildTree } from "@/features/page/tree/utils";
import { IPage } from "@/features/page/types/page.types.ts";
import React, { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { ConfluenceIcon } from "@/components/icons/confluence-icon.tsx";
import { getFileImportSizeLimit } from "@/lib/config.ts";
import { formatBytes } from "@/lib";
import { getFileTaskById } from "@/features/file-task/services/file-task-service.ts";
import { queryClient } from "@/main.tsx";
import { useQueryEmit } from "@/features/websocket/use-query-emit.ts";
import bytes from "bytes";

interface PageImportModalProps {
  spaceId: string;
  open: boolean;
  onClose: () => void;
}

export default function PageImportModal({
  spaceId,
  open,
  onClose,
}: PageImportModalProps) {
  const { t } = useTranslation();
  return (
    <>
      <Modal.Root
        opened={open}
        onClose={onClose}
        size={600}
        padding="xl"
        yOffset="10vh"
        xOffset={0}
        mah={400}
        keepMounted={true}
      >
        <Modal.Overlay />
        <Modal.Content style={{ overflow: "hidden" }}>
          <Modal.Header py={0}>
            <Modal.Title fw={500}>{t("Import pages")}</Modal.Title>
            <Modal.CloseButton aria-label={t("Close")} />
          </Modal.Header>
          <Modal.Body>
            <ImportFormatSelection
              spaceId={spaceId}
              open={open}
              onClose={onClose}
            />
          </Modal.Body>
        </Modal.Content>
      </Modal.Root>
    </>
  );
}

interface ImportFormatSelection {
  spaceId: string;
  open: boolean;
  onClose: () => void;
}
function ImportFormatSelection({
  spaceId,
  open,
  onClose,
}: ImportFormatSelection) {
  const { t } = useTranslation();
  const [treeData, setTreeData] = useAtom(treeDataAtom);
  const [fileTaskId, setFileTaskId] = useState<string | null>(null);
  const [showWebForm, setShowWebForm] = useState(false);
  const emit = useQueryEmit();

  // the modal stays mounted; start from the format list each time it opens
  useEffect(() => {
    if (!open) setShowWebForm(false);
  }, [open]);

  const markdownFileRef = useRef<() => void>(null);
  const htmlFileRef = useRef<() => void>(null);
  const docxFileRef = useRef<() => void>(null);
  const pdfFileRef = useRef<() => void>(null);
  const notionFileRef = useRef<() => void>(null);
  const confluenceFileRef = useRef<() => void>(null);
  const zipFileRef = useRef<() => void>(null);


  const handleZipUpload = async (selectedFile: File, source: string) => {
    if (!selectedFile) {
      return;
    }

    const maxSize = getFileImportSizeLimit();
    if (selectedFile.size > maxSize) {
      notifications.show({
        color: "red",
        message: t("File exceeds the {{limit}} import limit", {
          limit: formatBytes(maxSize),
        }),
      });
      return;
    }

    try {
      onClose();

      notifications.show({
        id: "import",
        title: t("Uploading import file"),
        message: t("Please don't close this tab."),
        loading: true,
        withCloseButton: false,
        autoClose: false,
      });

      const importTask = await importZip(selectedFile, spaceId, source);
      notifications.update({
        id: "import",
        title: t("Importing pages"),
        message: t(
          "Page import is in progress. You can check back later if this takes longer.",
        ),
        loading: true,
        withCloseButton: true,
        autoClose: false,
      });

      setFileTaskId(importTask.id);

      // Reset file input after successful upload
      if (source === "notion" && notionFileRef.current) {
        notionFileRef.current();
      } else if (source === "confluence" && confluenceFileRef.current) {
        confluenceFileRef.current();
      } else if (source === "generic" && zipFileRef.current) {
        zipFileRef.current();
      }
    } catch (err) {
      console.log("Failed to upload import file", err);
      notifications.update({
        id: "import",
        color: "red",
        title: t("Failed to upload import file"),
        message: err?.response.data.message,
        icon: <IconX size={18} />,
        loading: false,
        withCloseButton: true,
        autoClose: false,
      });
    }
  };

  useEffect(() => {
    if (!fileTaskId) return;

    const intervalId = setInterval(async () => {
      try {
        const fileTask = await getFileTaskById(fileTaskId);
        const status = fileTask.status;

        if (status === "success") {
          notifications.update({
            id: "import",
            color: "teal",
            title: t("Import complete"),
            message: t("Your pages were successfully imported."),
            icon: <IconCheck size={18} />,
            loading: false,
            withCloseButton: true,
            autoClose: false,
          });
          clearInterval(intervalId);
          setFileTaskId(null);

          await queryClient.refetchQueries({
            queryKey: ["root-sidebar-pages", fileTask.spaceId],
          });

          await queryClient.invalidateQueries({
            queryKey: ["recent-changes", fileTask.spaceId],
          });

          setTimeout(() => {
            emit({
              operation: "refetchRootTreeNodeEvent",
              spaceId: spaceId,
            });
          }, 50);
        }

        if (status === "failed") {
          notifications.update({
            id: "import",
            color: "red",
            title: t("Page import failed"),
            message: t(
              "Something went wrong while importing pages: {{reason}}.",
              {
                reason: fileTask.errorMessage,
              },
            ),
            icon: <IconX size={18} />,
            loading: false,
            withCloseButton: true,
            autoClose: false,
          });
          clearInterval(intervalId);
          setFileTaskId(null);
          console.error(fileTask.errorMessage);
        }
      } catch (err) {
        notifications.update({
          id: "import",
          color: "red",
          title: t("Import failed"),
          message: t(
            "Something went wrong while importing pages: {{reason}}.",
            {
              reason: err.response?.data.message,
            },
          ),
          icon: <IconX size={18} />,
          loading: false,
          withCloseButton: true,
          autoClose: false,
        });
        clearInterval(intervalId);
        setFileTaskId(null);
        console.error("Failed to fetch import status", err);
      }
    }, 3000);
  }, [fileTaskId]);

  const maxSingleFileSize = bytes("30mb");

  const handleFileUpload = async (selectedFiles: File[]) => {
    if (!selectedFiles) {
      return;
    }

    const oversizedFiles = selectedFiles.filter(
      (f) => f.size > maxSingleFileSize,
    );
    if (oversizedFiles.length > 0) {
      notifications.show({
        color: "red",
        message: t("File exceeds the {{limit}} import limit", {
          limit: formatBytes(maxSingleFileSize),
        }),
      });
      return;
    }

    onClose();

    const alert = notifications.show({
      title: t("Importing pages"),
      message: t("Page import is in progress. Please do not close this tab."),
      loading: true,
      autoClose: false,
    });

    const pages: IPage[] = [];
    let pageCount = 0;

    for (const file of selectedFiles) {
      try {
        const page = await importPage(file, spaceId);
        pages.push(page);
        pageCount += 1;
      } catch (err) {
        console.log("Failed to import page", err);
      }
    }

    if (pages?.length > 0 && pageCount > 0) {
      const newTreeNodes = buildTree(pages);
      const fullTree = treeData.concat(newTreeNodes);

      if (newTreeNodes?.length && fullTree?.length > 0) {
        setTreeData(fullTree);
      }

      // Reset file inputs after successful upload
      if (markdownFileRef.current) markdownFileRef.current();
      if (htmlFileRef.current) htmlFileRef.current();
      if (docxFileRef.current) docxFileRef.current();
      if (pdfFileRef.current) pdfFileRef.current();

      const pageCountText =
        pageCount === 1 ? `1 ${t("page")}` : `${pageCount} ${t("pages")}`;

      notifications.update({
        id: alert,
        color: "teal",
        title: `${t("Successfully imported")} ${pageCountText}`,
        message: t("Your import is complete."),
        icon: <IconCheck size={18} />,
        loading: false,
        autoClose: 5000,
      });
    } else {
      notifications.update({
        id: alert,
        color: "red",
        title: t("Failed to import pages"),
        message: t("Unable to import pages. Please try again."),
        icon: <IconX size={18} />,
        loading: false,
        autoClose: 5000,
      });
    }
  };

  const handleWebPageImport = async (url: string, mode: "article" | "full") => {
    onClose();

    const alert = notifications.show({
      title: t("Importing web page"),
      message: t("Reading {{url}}", { url }),
      loading: true,
      autoClose: false,
    });

    try {
      const page = await importWebPage(url, spaceId, mode);
      const newTreeNodes = buildTree([page]);
      if (newTreeNodes?.length) {
        setTreeData(treeData.concat(newTreeNodes));
      }

      notifications.update({
        id: alert,
        color: "teal",
        title: `${t("Successfully imported")} 1 ${t("page")}`,
        message: page.title,
        icon: <IconCheck size={18} />,
        loading: false,
        autoClose: 5000,
      });
    } catch (err) {
      notifications.update({
        id: alert,
        color: "red",
        title: t("Failed to import web page"),
        message:
          err?.response?.data?.message ??
          t("Unable to import pages. Please try again."),
        icon: <IconX size={18} />,
        loading: false,
        autoClose: 8000,
      });
    }
  };

  if (showWebForm) {
    return (
      <WebPageImportForm
        onBack={() => setShowWebForm(false)}
        onSubmit={handleWebPageImport}
      />
    );
  }

  // @ts-ignore
  return (
    <>
      <SimpleGrid cols={2}>
        <FileButton
          onChange={handleFileUpload}
          accept=".md"
          multiple
          resetRef={markdownFileRef}
          inputProps={{
            "aria-label": t("Choose {{format}} file", { format: "Markdown" }),
          }}
        >
          {(props) => (
            <Button
              justify="start"
              variant="default"
              leftSection={<IconMarkdown size={18} />}
              {...props}
            >
              Markdown
            </Button>
          )}
        </FileButton>

        <FileButton
          onChange={handleFileUpload}
          accept="text/html"
          multiple
          resetRef={htmlFileRef}
          inputProps={{
            "aria-label": t("Choose {{format}} file", { format: "HTML" }),
          }}
        >
          {(props) => (
            <Button
              justify="start"
              variant="default"
              leftSection={<IconFileCode size={18} />}
              {...props}
            >
              HTML
            </Button>
          )}
        </FileButton>

        <FileButton
          onChange={handleFileUpload}
          accept=".docx"
          multiple
          resetRef={docxFileRef}
          inputProps={{
            "aria-label": t("Choose {{format}} file", { format: "Word (DOCX)" }),
          }}
        >
          {(props) => (
            <Button
              justify="start"
              variant="default"
              leftSection={<IconFileTypeDocx size={18} />}
              {...props}
            >
              Word (DOCX)
            </Button>
          )}
        </FileButton>

        <FileButton
          onChange={handleFileUpload}
          accept=".pdf"
          multiple
          resetRef={pdfFileRef}
          inputProps={{
            "aria-label": t("Choose {{format}} file", { format: "PDF" }),
          }}
        >
          {(props) => (
            <Button
              justify="start"
              variant="default"
              leftSection={<IconFileTypePdf size={18} />}
              {...props}
            >
              PDF
            </Button>
          )}
        </FileButton>

        <FileButton
          onChange={(file) => handleZipUpload(file, "notion")}
          accept="application/zip"
          resetRef={notionFileRef}
          inputProps={{
            "aria-label": t("Choose {{format}} file", { format: "Notion" }),
          }}
        >
          {(props) => (
            <Button
              justify="start"
              variant="default"
              leftSection={<IconBrandNotion size={18} />}
              {...props}
            >
              Notion
            </Button>
          )}
        </FileButton>
        <FileButton
          onChange={(file) => handleZipUpload(file, "confluence")}
          accept="application/zip"
          resetRef={confluenceFileRef}
          inputProps={{
            "aria-label": t("Choose {{format}} file", { format: "Confluence" }),
          }}
        >
          {(props) => (
            <Tooltip
              label={t(
                "Export the space from Confluence as HTML (Space settings > Export space > HTML), then upload the zip file.",
              )}
              multiline
              w={260}
              withArrow
            >
              <Button
                justify="start"
                variant="default"
                leftSection={<ConfluenceIcon size={18} />}
                {...props}
              >
                Confluence
              </Button>
            </Tooltip>
          )}
        </FileButton>

        <Button
          justify="start"
          variant="default"
          leftSection={<IconWorldWww size={18} />}
          onClick={() => setShowWebForm(true)}
        >
          {t("Web page")}
        </Button>
      </SimpleGrid>

      <Group justify="center" gap="xl" mih={150}>
        <div>
          <Text ta="center" size="lg" inline>
            Import zip file
          </Text>
          <Text ta="center" size="sm" c="dimmed" inline py="sm">
            {t(
              `Upload zip file containing Markdown and HTML files. Max: {{sizeLimit}}`,
              {
                sizeLimit: formatBytes(getFileImportSizeLimit()),
              },
            )}
          </Text>
          <FileButton
            onChange={(file) => handleZipUpload(file, "generic")}
            accept="application/zip"
            resetRef={zipFileRef}
            inputProps={{
              "aria-label": t("Choose {{format}} file", { format: "ZIP" }),
            }}
          >
            {(props) => (
              <Group justify="center">
                <Button
                  justify="center"
                  leftSection={<IconFileTypeZip size={18} />}
                  {...props}
                >
                  {t("Upload file")}
                </Button>
              </Group>
            )}
          </FileButton>
        </div>
      </Group>
    </>
  );
}

interface WebPageImportFormProps {
  onBack: () => void;
  onSubmit: (url: string, mode: "article" | "full") => void;
}

function WebPageImportForm({ onBack, onSubmit }: WebPageImportFormProps) {
  const { t } = useTranslation();
  const [url, setUrl] = useState("");
  const [fullPage, setFullPage] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    let value = url.trim();
    if (value && !/^[a-z][a-z0-9+.-]*:\/\//i.test(value)) {
      value = `https://${value}`;
    }
    try {
      const parsed = new URL(value);
      if (!["http:", "https:"].includes(parsed.protocol)) throw new Error();
    } catch {
      setError(t("Enter a valid web address"));
      return;
    }
    onSubmit(value, fullPage ? "full" : "article");
    setUrl("");
    setError(null);
  };

  return (
    <form onSubmit={submit}>
      <Stack gap="sm">
        <TextInput
          label={t("Web page URL")}
          placeholder="https://example.com/article"
          value={url}
          onChange={(e) => {
            setUrl(e.currentTarget.value);
            setError(null);
          }}
          error={error}
          leftSection={<IconWorldWww size={16} />}
          data-autofocus
        />
        <Checkbox
          label={t("Import the whole page")}
          description={t(
            "By default only the main content is kept, without menus, sidebars and footers.",
          )}
          checked={fullPage}
          onChange={(e) => setFullPage(e.currentTarget.checked)}
        />
        <Group justify="space-between" mt="xs">
          <Button variant="default" onClick={onBack}>
            {t("Back")}
          </Button>
          <Button type="submit" disabled={!url.trim()}>
            {t("Import")}
          </Button>
        </Group>
      </Stack>
    </form>
  );
}
