import "@/features/editor/styles/index.css";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  Alert,
  Button,
  Container,
  Group,
  Loader,
  Stack,
  Text,
  Textarea,
  TextInput,
} from "@mantine/core";
import { IconArrowLeft, IconTemplate } from "@tabler/icons-react";
import { EditorContent, useEditor } from "@tiptap/react";
import { Link, useParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { DocumentTitle } from "@/components/ui/document-title.tsx";
import EmojiPicker from "@/components/ui/emoji-picker.tsx";
import { mainExtensions } from "@/features/editor/extensions/extensions";
import {
  useTemplateQuery,
  useUpdateTemplateMutation,
} from "@/features/template/queries/template-query";
import {
  GLOBAL_SCOPE,
  TemplateScopeSelect,
} from "@/features/template/components/template-scope-select";
import { IUpdateTemplate } from "@/features/template/types/template.types";

const SAVE_DELAY_MS = 1000;

type SaveState = "idle" | "saving" | "saved";

export default function TemplateEditor() {
  const { t } = useTranslation();
  const { templateId } = useParams();
  const { data: template, isLoading } = useTemplateQuery(templateId);

  if (isLoading || !template) {
    return (
      <Group justify="center" p="xl">
        <Loader size="sm" />
      </Group>
    );
  }

  return (
    <TemplateEditorForm
      key={template.id}
      templateId={template.id}
      initial={template}
      canManage={template.permissions?.canManage ?? false}
      t={t}
    />
  );
}

function TemplateEditorForm({
  templateId,
  initial,
  canManage,
  t,
}: {
  templateId: string;
  initial: {
    title: string | null;
    description: string | null;
    icon: string | null;
    spaceId: string | null;
    content?: any;
  };
  canManage: boolean;
  t: (key: string, opts?: any) => string;
}) {
  const updateMutation = useUpdateTemplateMutation();
  const [title, setTitle] = useState(initial.title ?? "");
  const [description, setDescription] = useState(initial.description ?? "");
  const [icon, setIcon] = useState(initial.icon);
  const [scope, setScope] = useState(initial.spaceId ?? GLOBAL_SCOPE);
  const [saveState, setSaveState] = useState<SaveState>("idle");
  const pending = useRef<Partial<IUpdateTemplate>>({});
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const save = async () => {
    const changes = pending.current;
    pending.current = {};
    if (Object.keys(changes).length === 0) return;
    setSaveState("saving");
    try {
      await updateMutation.mutateAsync({ templateId, ...changes });
      setSaveState("saved");
    } catch {
      setSaveState("idle");
    }
  };

  // batches edits and saves once typing pauses
  const queueSave = (changes: Partial<IUpdateTemplate>) => {
    if (!canManage) return;
    pending.current = { ...pending.current, ...changes };
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(save, SAVE_DELAY_MS);
  };

  useEffect(
    () => () => {
      if (timer.current) {
        clearTimeout(timer.current);
        save();
      }
    },
    // flush pending edits when leaving the page
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  const extensions = useMemo(() => mainExtensions, []);
  const editor = useEditor({
    extensions,
    content: initial.content ?? "",
    editable: canManage,
    immediatelyRender: true,
    onUpdate: ({ editor }) => queueSave({ content: editor.getJSON() }),
  });

  return (
    <Container size={900} py="xl">
      <DocumentTitle title={title || t("Untitled")} />

      <Group justify="space-between" mb="md">
        <Button
          component={Link}
          to="/templates"
          variant="subtle"
          color="gray"
          leftSection={<IconArrowLeft size={16} />}
        >
          {t("Templates")}
        </Button>
        <Text size="sm" c="dimmed">
          {saveState === "saving"
            ? t("Saving...")
            : saveState === "saved"
              ? t("Saved")
              : ""}
        </Text>
      </Group>

      {!canManage && (
        <Alert color="gray" mb="md">
          {t("You can use this template but not edit it.")}
        </Alert>
      )}

      <Stack gap="sm" mb="lg">
        <Group gap="xs" wrap="nowrap" align="center">
          <EmojiPicker
            onEmojiSelect={(emoji: { native: string }) => {
              setIcon(emoji.native);
              queueSave({ icon: emoji.native });
            }}
            removeEmojiAction={() => {
              setIcon(null);
              queueSave({ icon: "" });
            }}
            icon={icon ? icon : <IconTemplate size={22} />}
            readOnly={!canManage}
            actionIconProps={{ size: "lg" }}
          />
          <TextInput
            variant="unstyled"
            size="xl"
            fw={700}
            placeholder={t("Untitled")}
            value={title}
            readOnly={!canManage}
            onChange={(e) => {
              setTitle(e.currentTarget.value);
              queueSave({ title: e.currentTarget.value });
            }}
            style={{ flex: 1 }}
          />
        </Group>
        <Textarea
          placeholder={t("Add a description")}
          autosize
          minRows={1}
          value={description}
          readOnly={!canManage}
          onChange={(e) => {
            setDescription(e.currentTarget.value);
            queueSave({ description: e.currentTarget.value });
          }}
        />
        {canManage && (
          <TemplateScopeSelect
            value={scope}
            onChange={(value) => {
              setScope(value);
              queueSave({ spaceId: value === GLOBAL_SCOPE ? null : value });
            }}
          />
        )}
      </Stack>

      <div className="editor-container" style={{ position: "relative" }}>
        <EditorContent editor={editor} />
      </div>
    </Container>
  );
}
