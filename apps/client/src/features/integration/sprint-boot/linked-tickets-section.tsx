import { Anchor, Badge, Group, Stack, Text } from "@mantine/core";
import type { Editor } from "@tiptap/react";
import { useEditorState } from "@tiptap/react";
import { useTranslation } from "react-i18next";
import { useUnfurl } from "@/features/editor/components/integration-link/use-unfurl";
import { SPRINT_BOOT_TYPE } from "./sprint-boot-service";

// The Sprint Boot tickets a page links to, read from the open document, for the page details aside.
export function LinkedTicketsSection({ editor }: { editor: Editor | null }) {
  const { t } = useTranslation();
  const urls =
    useEditorState({
      editor,
      selector: ({ editor: current }) => {
        if (!current) return [] as string[];
        const found = new Set<string>();
        current.state.doc.descendants((node) => {
          if (
            (node.type.name === "integrationMention" || node.type.name === "integrationCard") &&
            node.attrs.provider === SPRINT_BOOT_TYPE &&
            typeof node.attrs.url === "string"
          ) {
            found.add(node.attrs.url);
          }
        });
        return [...found];
      },
      equalityFn: (a, b) => a.length === b.length && a.every((url, index) => url === b?.[index]),
    }) ?? [];

  if (urls.length === 0) return null;

  return (
    <Stack gap="xs">
      <Text size="sm" fw={500}>{t("Linked tickets")}</Text>
      {urls.map((url) => <TicketRow key={url} url={url} />)}
    </Stack>
  );
}

function TicketRow({ url }: { url: string }) {
  const unfurl = useUnfurl(url);
  const data = unfurl.state === "loaded" ? unfurl.data : null;

  return (
    <Group justify="space-between" wrap="nowrap" gap="xs">
      <Anchor href={url} target="_blank" rel="noopener noreferrer" size="sm" lineClamp={1}>
        {data?.title ?? url.replace(/^.*\/browse\//, "")}
      </Anchor>
      {data?.status && (
        <Badge size="xs" variant="light" color={data.statusColor ?? "gray"} style={{ flexShrink: 0 }}>
          {data.status}
        </Badge>
      )}
    </Group>
  );
}
