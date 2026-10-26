import { useEffect, useMemo, useState } from "react";
import {
  Alert,
  Autocomplete,
  AutocompleteProps,
  Badge,
  Button,
  Group,
  NumberInput,
  Paper,
  PasswordInput,
  Select,
  Stack,
  Text,
  TextInput,
  Title,
} from "@mantine/core";
import { modals } from "@mantine/modals";
import { notifications } from "@mantine/notifications";
import {
  IconCircleCheck,
  IconCircleX,
  IconDownload,
  IconPlugConnected,
} from "@tabler/icons-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import {
  AiDriver,
  deleteAiProvider,
  getAiProvider,
  IAiEmbeddingTestResult,
  IAiModel,
  IAiProviderInfo,
  IAiTestResult,
  listAiModels,
  saveAiProvider,
  testAiEmbedding,
  testAiProvider,
} from "@/features/ai/services/ai-provider-service";

export const AI_PROVIDER_KEY = ["ai-provider"];

const DRIVERS: { value: AiDriver; label: string }[] = [
  { value: "ollama", label: "Ollama" },
  { value: "openai", label: "OpenAI" },
  { value: "openai-compatible", label: "OpenAI-compatible" },
  { value: "gemini", label: "Gemini" },
];

const URL_PLACEHOLDER: Record<AiDriver, string> = {
  ollama: "http://localhost:11434",
  openai: "https://api.openai.com/v1",
  "openai-compatible": "https://openrouter.ai/api/v1",
  gemini: "",
};

function errorText(err: any) {
  return err?.response?.data?.message ?? err?.message ?? String(err);
}

function formatSize(bytes?: number) {
  return bytes ? `${(bytes / 1e9).toFixed(1)} GB` : "";
}

// Choose and configure the workspace's AI provider. Keys are write-only.
export function AiProviderForm() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const { data: info } = useQuery({
    queryKey: AI_PROVIDER_KEY,
    queryFn: getAiProvider,
  });

  const [driver, setDriver] = useState<AiDriver>("ollama");
  const [baseUrl, setBaseUrl] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [completionModel, setCompletionModel] = useState("");
  const [chatModel, setChatModel] = useState("");
  const [embeddingModel, setEmbeddingModel] = useState("");
  const [embeddingDimensions, setEmbeddingDimensions] = useState<
    number | string
  >("");
  const [models, setModels] = useState<IAiModel[]>([]);
  const [testResult, setTestResult] = useState<IAiTestResult | null>(null);
  const [embeddingResult, setEmbeddingResult] =
    useState<IAiEmbeddingTestResult | null>(null);

  // start from the saved configuration
  useEffect(() => {
    if (!info) return;
    setDriver(info.driver ?? "ollama");
    setBaseUrl(info.baseUrl ?? "");
    setApiKey("");
    setCompletionModel(info.completionModel ?? "");
    setChatModel(info.chatModel ?? "");
    setEmbeddingModel(info.embeddingModel ?? "");
    setEmbeddingDimensions(info.embeddingDimensions ?? "");
  }, [info]);

  const savedKeyApplies =
    info?.source === "workspace" && info.hasApiKey && info.driver === driver;
  const needsUrl = driver === "ollama" || driver === "openai-compatible";
  const needsKey = driver === "openai" || driver === "gemini";
  const connection = {
    driver,
    ...(driver !== "gemini" && baseUrl.trim() && { baseUrl: baseUrl.trim() }),
    ...(apiKey && { apiKey }),
  };
  const connectionReady =
    (!needsUrl || !!baseUrl.trim()) &&
    (!needsKey || !!apiKey || savedKeyApplies);

  const onSaved = (updated: IAiProviderInfo) => {
    queryClient.setQueryData(AI_PROVIDER_KEY, updated);
    queryClient.invalidateQueries({ queryKey: ["ai-status"] });
  };

  const loadModels = useMutation({
    mutationFn: () => listAiModels(connection),
    onSuccess: (list) => {
      setModels(list);
      if (list.length === 0) {
        notifications.show({ message: t("The provider has no models") });
      }
    },
    onError: (err) =>
      notifications.show({ message: errorText(err), color: "red" }),
  });

  const test = useMutation({
    mutationFn: () =>
      testAiProvider({ ...connection, model: completionModel.trim() }),
    onSuccess: setTestResult,
    onError: (err) =>
      setTestResult({ ok: false, latencyMs: 0, error: errorText(err) }),
  });

  const dimensions =
    typeof embeddingDimensions === "number" ? embeddingDimensions : undefined;

  const testEmbedding = useMutation({
    mutationFn: () =>
      testAiEmbedding({
        ...connection,
        model: embeddingModel.trim(),
        ...(dimensions && { dimensions }),
      }),
    onSuccess: setEmbeddingResult,
    onError: (err) =>
      setEmbeddingResult({ ok: false, latencyMs: 0, error: errorText(err) }),
  });

  const save = useMutation({
    mutationFn: () =>
      saveAiProvider({
        ...connection,
        completionModel: completionModel.trim(),
        ...(chatModel.trim() && { chatModel: chatModel.trim() }),
        ...(embeddingModel.trim() && {
          embeddingModel: embeddingModel.trim(),
          ...(dimensions && { embeddingDimensions: dimensions }),
        }),
      }),
    onSuccess: (updated) => {
      onSaved(updated);
      notifications.show({ message: t("AI provider saved") });
    },
    onError: (err) =>
      notifications.show({ message: errorText(err), color: "red" }),
  });

  const remove = useMutation({
    mutationFn: deleteAiProvider,
    onSuccess: (updated) => {
      onSaved(updated);
      setModels([]);
      setTestResult(null);
      setEmbeddingResult(null);
      notifications.show({ message: t("AI provider removed") });
    },
  });

  // models loaded from the provider; a name can also be typed
  const modelIds = useMemo(() => models.map((m) => m.id), [models]);
  const renderModel: AutocompleteProps["renderOption"] = ({ option }) => {
    const model = models.find((m) => m.id === option.value);
    const notes = [
      model?.supportsTools ? t("supports tools") : null,
      formatSize(model?.size),
    ].filter(Boolean);
    return (
      <Group gap="xs" wrap="nowrap">
        <Text size="sm">{option.value}</Text>
        {notes.length > 0 && (
          <Text size="xs" c="dimmed">
            {notes.join(" · ")}
          </Text>
        )}
      </Group>
    );
  };

  const changeDriver = (value: AiDriver) => {
    setDriver(value);
    setModels([]);
    setTestResult(null);
    setEmbeddingResult(null);
    if (value !== info?.driver) {
      setBaseUrl("");
      setCompletionModel("");
      setChatModel("");
      setEmbeddingModel("");
      setEmbeddingDimensions("");
    } else {
      setBaseUrl(info.baseUrl ?? "");
      setCompletionModel(info.completionModel ?? "");
      setChatModel(info.chatModel ?? "");
      setEmbeddingModel(info.embeddingModel ?? "");
      setEmbeddingDimensions(info.embeddingDimensions ?? "");
    }
  };

  const confirmRemove = () =>
    modals.openConfirmModal({
      title: t("Remove AI provider"),
      children: (
        <Text size="sm">
          {t("AI features stop working until a provider is configured again.")}
        </Text>
      ),
      labels: { confirm: t("Remove"), cancel: t("Cancel") },
      confirmProps: { color: "red" },
      onConfirm: () => remove.mutate(),
    });

  return (
    <Paper withBorder radius="md" p="md">
      <Stack gap="sm">
        <Group justify="space-between">
          <Title order={5}>{t("AI provider")}</Title>
          {info?.configured ? (
            <Badge color="green" variant="light">
              {info.source === "environment"
                ? t("Configured by the server environment")
                : t("Configured")}
            </Badge>
          ) : (
            <Badge color="gray" variant="light">
              {t("Not configured")}
            </Badge>
          )}
        </Group>

        {info?.source === "environment" && (
          <Alert variant="light" color="blue" p="xs">
            <Text size="xs">
              {t(
                "The server's AI_* environment variables are in use. Saving a provider here overrides them for this workspace.",
              )}
            </Text>
          </Alert>
        )}

        <Select
          label={t("Provider")}
          value={driver}
          onChange={(value) => value && changeDriver(value as AiDriver)}
          data={DRIVERS}
          allowDeselect={false}
          comboboxProps={{ withinPortal: true }}
        />

        {driver !== "gemini" && (
          <TextInput
            label={driver === "openai" ? t("Base URL") : t("Server URL")}
            description={
              driver === "openai"
                ? t("Optional. Leave empty for api.openai.com.")
                : undefined
            }
            placeholder={URL_PLACEHOLDER[driver]}
            value={baseUrl}
            onChange={(e) => setBaseUrl(e.currentTarget.value)}
            required={needsUrl}
          />
        )}

        <PasswordInput
          label={t("API key")}
          description={
            driver === "ollama"
              ? t(
                  "Optional. Sent as a Bearer token, for an Ollama behind an authenticating proxy.",
                )
              : undefined
          }
          placeholder={
            savedKeyApplies ? t("Leave empty to keep the current key") : ""
          }
          value={apiKey}
          onChange={(e) => setApiKey(e.currentTarget.value)}
          required={needsKey && !savedKeyApplies}
          autoComplete="new-password"
        />

        <Group align="flex-end" gap="xs" wrap="nowrap">
          <Autocomplete
            style={{ flex: 1 }}
            label={t("Model")}
            description={t("Used for Ask AI and AI answers.")}
            placeholder={t("Choose or type a model name")}
            data={modelIds}
            value={completionModel}
            onChange={setCompletionModel}
            renderOption={renderModel}
            limit={50}
            required
          />
          <Button
            variant="default"
            leftSection={<IconDownload size={16} />}
            onClick={() => loadModels.mutate()}
            loading={loadModels.isPending}
            disabled={!connectionReady}
          >
            {t("Load models")}
          </Button>
        </Group>

        <Autocomplete
          label={t("Chat model")}
          description={t(
            "Optional. Used for AI chat; needs tool support. Defaults to the model above.",
          )}
          placeholder={completionModel}
          data={modelIds}
          value={chatModel}
          onChange={setChatModel}
          renderOption={renderModel}
          limit={50}
        />

        <Autocomplete
          label={t("Embedding model")}
          description={t(
            "Optional. Turns pages and files into vectors so search finds related content by meaning, e.g. bge-m3 (Ollama) or text-embedding-3-small (OpenAI). Changing it rebuilds the search index.",
          )}
          placeholder={t("Choose or type a model name")}
          data={modelIds}
          value={embeddingModel}
          onChange={(value) => {
            setEmbeddingModel(value);
            setEmbeddingResult(null);
          }}
          renderOption={renderModel}
          limit={50}
        />

        {embeddingModel.trim() && driver !== "ollama" && (
          <NumberInput
            label={t("Embedding size")}
            description={t(
              "Optional. Shortens the vectors for models that allow it. Leave empty for the model's own size.",
            )}
            value={embeddingDimensions}
            onChange={(value) =>
              setEmbeddingDimensions(typeof value === "bigint" ? Number(value) : value)
            }
            min={64}
            max={4000}
            allowDecimal={false}
          />
        )}

        {embeddingModel.trim() && (
          <Group gap="xs">
            <Button
              variant="default"
              size="xs"
              onClick={() => testEmbedding.mutate()}
              loading={testEmbedding.isPending}
              disabled={!connectionReady}
            >
              {t("Test embedding")}
            </Button>
            {embeddingResult && (
              <Text size="xs" c={embeddingResult.ok ? "green" : "red"}>
                {embeddingResult.ok
                  ? t("Works. Vectors of {{count}} dimensions.", {
                      count: embeddingResult.dimensions,
                    })
                  : embeddingResult.error}
              </Text>
            )}
          </Group>
        )}

        {testResult && (
          <Alert
            variant="light"
            color={testResult.ok ? "green" : "red"}
            icon={
              testResult.ok ? (
                <IconCircleCheck size={18} />
              ) : (
                <IconCircleX size={18} />
              )
            }
            p="xs"
          >
            <Text size="sm">
              {testResult.ok
                ? t("Connected in {{seconds}}s. Reply: {{sample}}", {
                    seconds: (testResult.latencyMs / 1000).toFixed(1),
                    sample: testResult.sample,
                  })
                : testResult.error}
            </Text>
          </Alert>
        )}

        <Group justify="space-between" mt="xs">
          <Group gap="xs">
            <Button
              variant="default"
              leftSection={<IconPlugConnected size={16} />}
              onClick={() => test.mutate()}
              loading={test.isPending}
              disabled={!connectionReady || !completionModel.trim()}
            >
              {t("Test connection")}
            </Button>
            <Button
              onClick={() => save.mutate()}
              loading={save.isPending}
              disabled={!connectionReady || !completionModel.trim()}
            >
              {t("Save")}
            </Button>
          </Group>
          {info?.source === "workspace" && (
            <Button
              variant="subtle"
              color="red"
              onClick={confirmRemove}
              loading={remove.isPending}
            >
              {t("Remove")}
            </Button>
          )}
        </Group>
      </Stack>
    </Paper>
  );
}
