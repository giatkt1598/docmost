import { useEffect, useState } from "react";
import {
  Button,
  Group,
  Loader,
  Select,
  Stack,
  Text,
  TextInput,
  Textarea,
  UnstyledButton,
} from "@mantine/core";
import { modals } from "@mantine/modals";
import { notifications } from "@mantine/notifications";
import type { Editor, Range } from "@tiptap/core";
import i18n from "@/i18n.ts";
import { UnfurlResult } from "../types/integration.types";
import {
  createSprintBootTicket,
  getSprintBootSpaces,
  searchSprintBootTickets,
  SprintBootSpace,
  SPRINT_BOOT_TYPE,
} from "./sprint-boot-service";

const CREATE_MODAL = "sprint-boot-create-ticket";
const INSERT_MODAL = "sprint-boot-insert-ticket";

// What Sprint Boot or the network said, for a person to read.
function failureText(err: unknown): string {
  const message = (err as any)?.response?.data?.message;
  return typeof message === "string" && message
    ? message
    : i18n.t("Could not reach Sprint Boot");
}

function insertTicket(editor: Editor, range: Range, ticket: UnfurlResult) {
  editor
    .chain()
    .focus()
    .insertContentAt(range, {
      type: "integrationMention",
      attrs: { url: ticket.url, provider: SPRINT_BOOT_TYPE },
    })
    .run();
}

// The Sprint Boot spaces the person can create tickets in; the one this Docmost space is linked to comes first.
function useSprintBootSpaces(docmostSpaceId?: string) {
  const [spaces, setSpaces] = useState<SprintBootSpace[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    getSprintBootSpaces()
      .then((list) => {
        if (!alive) return;
        const linked = list.filter((space) => space.docmostSpaceId === docmostSpaceId);
        setSpaces([...linked, ...list.filter((space) => !linked.includes(space))]);
      })
      .catch((err) => alive && setError(failureText(err)));
    return () => {
      alive = false;
    };
  }, [docmostSpaceId]);

  return { spaces, error };
}

function CreateTicketForm({
  initialTitle,
  docmostSpaceId,
  onCreated,
}: {
  initialTitle: string;
  docmostSpaceId?: string;
  onCreated: (ticket: UnfurlResult) => void;
}) {
  const t = i18n.t.bind(i18n);
  const { spaces, error } = useSprintBootSpaces(docmostSpaceId);
  const [spaceKey, setSpaceKey] = useState<string | null>(null);
  const [title, setTitle] = useState(initialTitle.slice(0, 255));
  const [description, setDescription] = useState("");
  const [saving, setSaving] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);
  const chosen = spaceKey ?? spaces?.[0]?.key ?? null;

  const submit = async () => {
    if (!chosen || !title.trim()) return;
    setSaving(true);
    setFailure(null);
    try {
      onCreated(
        await createSprintBootTicket({
          spaceKey: chosen,
          title: title.trim(),
          description: description.trim() || undefined,
        }),
      );
    } catch (err) {
      setFailure(failureText(err));
    } finally {
      setSaving(false);
    }
  };

  if (error) return <Text c="red" size="sm">{error}</Text>;
  if (!spaces) return <Loader size="sm" />;
  if (spaces.length === 0) {
    return <Text size="sm" c="dimmed">{t("You cannot create tickets in any Sprint Boot space")}</Text>;
  }

  return (
    <Stack gap="sm">
      <Select
        label={t("Space")}
        data={spaces.map((space) => ({ value: space.key, label: `${space.name} (${space.key})` }))}
        value={chosen}
        onChange={(value) => setSpaceKey(typeof value === "string" ? value : null)}
        allowDeselect={false}
        comboboxProps={{ withinPortal: true }}
      />
      <TextInput
        label={t("Title")}
        value={title}
        maxLength={255}
        onChange={(event) => setTitle(event.currentTarget.value)}
        data-autofocus
      />
      <Textarea
        label={t("Description")}
        autosize
        minRows={2}
        maxRows={8}
        value={description}
        onChange={(event) => setDescription(event.currentTarget.value)}
      />
      {failure && <Text c="red" size="sm">{failure}</Text>}
      <Group justify="flex-end">
        <Button variant="default" onClick={() => modals.close(CREATE_MODAL)}>{t("Cancel")}</Button>
        <Button loading={saving} disabled={!title.trim()} onClick={submit}>{t("Create ticket")}</Button>
      </Group>
    </Stack>
  );
}

// Turns the selected text into a new Sprint Boot ticket, and the text into a link to it.
export function openCreateTicketModal(editor: Editor, docmostSpaceId?: string) {
  const { from, to } = editor.state.selection;
  const text = editor.state.doc.textBetween(from, to, " ").trim();

  modals.open({
    modalId: CREATE_MODAL,
    title: i18n.t("Create Sprint Boot ticket"),
    centered: true,
    children: (
      <CreateTicketForm
        initialTitle={text}
        docmostSpaceId={docmostSpaceId}
        onCreated={(ticket) => {
          modals.close(CREATE_MODAL);
          insertTicket(editor, { from, to }, ticket);
          notifications.show({ message: i18n.t("Ticket {{title}} created", { title: ticket.title }) });
        }}
      />
    ),
  });
}

function InsertTicketPicker({ onPick }: { onPick: (ticket: UnfurlResult) => void }) {
  const t = i18n.t.bind(i18n);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<UnfurlResult[] | null>(null);
  const [failure, setFailure] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    const timer = setTimeout(() => {
      searchSprintBootTickets({ query: query.trim() || undefined, limit: 10 })
        .then((list) => alive && (setResults(list), setFailure(null)))
        .catch((err) => alive && setFailure(failureText(err)));
    }, 250);
    return () => {
      alive = false;
      clearTimeout(timer);
    };
  }, [query]);

  return (
    <Stack gap="sm">
      <TextInput
        label={t("Search tickets")}
        placeholder={t("Key or words from the title")}
        value={query}
        onChange={(event) => setQuery(event.currentTarget.value)}
        data-autofocus
      />
      {failure && <Text c="red" size="sm">{failure}</Text>}
      {!results && !failure && <Loader size="sm" />}
      {results?.length === 0 && <Text size="sm" c="dimmed">{t("No tickets found")}</Text>}
      <Stack gap={4}>
        {results?.map((ticket) => (
          <UnstyledButton key={ticket.url} onClick={() => onPick(ticket)} p={6} style={{ borderRadius: 6 }}>
            <Text size="sm" fw={500} truncate>{ticket.title}</Text>
            <Text size="xs" c="dimmed">{[ticket.status, ticket.author].filter(Boolean).join(" · ")}</Text>
          </UnstyledButton>
        ))}
      </Stack>
    </Stack>
  );
}

// Slash command: find a ticket and insert a live link to it where the command was typed.
export function openInsertTicketModal(editor: Editor, range: Range) {
  editor.chain().focus().deleteRange(range).run();
  const at = editor.state.selection.from;

  modals.open({
    modalId: INSERT_MODAL,
    title: i18n.t("Insert Sprint Boot ticket"),
    centered: true,
    children: (
      <InsertTicketPicker
        onPick={(ticket) => {
          modals.close(INSERT_MODAL);
          insertTicket(editor, { from: at, to: at }, ticket);
        }}
      />
    ),
  });
}
