import { useState } from "react";
import {
  Accordion,
  Alert,
  Badge,
  Button,
  Code,
  FileInput,
  Group,
  Select,
  Stack,
  Table,
  Text,
  TextInput,
  Textarea,
} from "@mantine/core";
import { IconPlayerPlay } from "@tabler/icons-react";
import { useTranslation } from "react-i18next";
import CopyTextButton from "@/components/common/copy.tsx";
import { IApiOperation } from "@/features/api-docs/types/api-docs.types";
import {
  curlExample,
  describeConstraints,
  describeType,
  exampleBody,
  isFileField,
  multipartFields,
} from "@/features/api-docs/api-docs.utils";

const METHOD_COLORS: Record<string, string> = {
  get: "green",
  post: "blue",
  put: "orange",
  patch: "orange",
  delete: "red",
};

interface ApiEndpointProps {
  op: IApiOperation;
  baseUrl: string;
}

export function ApiEndpoint({ op, baseUrl }: ApiEndpointProps) {
  const { t } = useTranslation();
  const example = op.body && !op.multipart ? exampleBody(op.body) : null;
  const curl = curlExample(baseUrl, op, example);
  const fields = Object.entries(op.body?.properties ?? {});
  const required = new Set(op.body?.required ?? []);

  const [payload, setPayload] = useState(
    JSON.stringify(example ?? {}, null, 2),
  );
  const [response, setResponse] = useState<{
    status: number;
    body: string;
  } | null>(null);
  const [sending, setSending] = useState(false);
  const [jsonError, setJsonError] = useState<string | null>(null);
  const [formValues, setFormValues] = useState<Record<string, string>>({});
  const [formFiles, setFormFiles] = useState<Record<string, File | null>>({});

  const multipartBody = () => {
    const form = new FormData();
    for (const [name, schema] of multipartFields(op.body)) {
      if (isFileField(schema)) {
        const file = formFiles[name];
        if (file) form.append(name, file);
      } else if (formValues[name]) {
        form.append(name, formValues[name]);
      }
    }
    return form;
  };

  const send = async () => {
    let body: string | FormData | undefined;
    if (op.multipart) {
      body = multipartBody();
    } else if (op.method !== "get") {
      try {
        body = JSON.stringify(JSON.parse(payload || "{}"));
        setJsonError(null);
      } catch {
        setJsonError(t("Invalid JSON"));
        return;
      }
    }
    setSending(true);
    try {
      // runs with the current session, as the signed-in user
      const res = await fetch(op.path, {
        method: op.method.toUpperCase(),
        credentials: "include",
        // FormData sets its own multipart boundary
        headers:
          typeof body === "string"
            ? { "Content-Type": "application/json" }
            : undefined,
        body,
      });
      const text = await res.text();
      let pretty = text;
      try {
        pretty = JSON.stringify(JSON.parse(text), null, 2);
      } catch {
        // not JSON (e.g. a file)
      }
      setResponse({ status: res.status, body: pretty.slice(0, 20000) });
    } catch (err: any) {
      setResponse({ status: 0, body: String(err?.message ?? err) });
    } finally {
      setSending(false);
    }
  };

  return (
    <Accordion.Item value={op.operationId}>
      <Accordion.Control>
        <Group gap="sm" wrap="nowrap">
          <Badge
            color={METHOD_COLORS[op.method] ?? "gray"}
            variant="light"
            w={64}
            style={{ flexShrink: 0 }}
          >
            {op.method.toUpperCase()}
          </Badge>
          <Text ff="monospace" size="sm" style={{ wordBreak: "break-all" }}>
            {op.path}
          </Text>
          <Text size="sm" c="dimmed" visibleFrom="sm" lineClamp={1}>
            {op.summary}
          </Text>
        </Group>
      </Accordion.Control>
      <Accordion.Panel>
        <Stack gap="md">
          <Group gap="xs">
            <Text size="sm" fw={500}>
              {op.summary}
            </Text>
            <Badge
              size="sm"
              variant="outline"
              color={op.scope === "write" ? "orange" : "gray"}
            >
              {op.scope === "write" ? t("Write") : t("Read")}
            </Badge>
            {op.sessionOnly && (
              <Badge size="sm" variant="light" color="red">
                {t("Session only")}
              </Badge>
            )}
          </Group>

          {op.description && (
            <Text size="sm" c="dimmed" style={{ whiteSpace: "pre-line" }}>
              {op.description}
            </Text>
          )}

          {op.pathParams.length > 0 && (
            <Text size="sm">
              {t("Path parameters")}:{" "}
              {op.pathParams.map((p) => (
                <Code key={p} mr={4}>
                  {p}
                </Code>
              ))}
            </Text>
          )}

          {fields.length > 0 ? (
            <Table.ScrollContainer minWidth={480}>
              <Table withTableBorder verticalSpacing={6} fz="sm">
                <Table.Thead>
                  <Table.Tr>
                    <Table.Th>{t("Field")}</Table.Th>
                    <Table.Th>{t("Type")}</Table.Th>
                    <Table.Th>{t("Required")}</Table.Th>
                    <Table.Th>{t("Constraints")}</Table.Th>
                  </Table.Tr>
                </Table.Thead>
                <Table.Tbody>
                  {fields.map(([name, schema]) => (
                    <Table.Tr key={name}>
                      <Table.Td>
                        <Code>{name}</Code>
                      </Table.Td>
                      <Table.Td>{describeType(schema)}</Table.Td>
                      <Table.Td>
                        {required.has(name) ? t("Yes") : t("No")}
                      </Table.Td>
                      <Table.Td>
                        <Text size="xs" c="dimmed">
                          {describeConstraints(schema).join(", ")}
                        </Text>
                      </Table.Td>
                    </Table.Tr>
                  ))}
                </Table.Tbody>
              </Table>
            </Table.ScrollContainer>
          ) : (
            op.method !== "get" && (
              <Text size="sm" c="dimmed">
                {t("No request body. Send an empty JSON object.")}
              </Text>
            )
          )}

          <div>
            <Group justify="space-between" mb={4}>
              <Text size="sm" fw={500}>
                {t("Example request")}
              </Text>
              <CopyTextButton text={curl} />
            </Group>
            <Code
              block
              style={{ whiteSpace: "pre-wrap", wordBreak: "break-all" }}
            >
              {curl}
            </Code>
          </div>

          {!op.sessionOnly && (
            <Stack gap="xs">
              <Text size="sm" fw={500}>
                {t("Try it")}
              </Text>
              {op.scope === "write" && (
                <Alert variant="light" color="orange" p="xs">
                  <Text size="xs">
                    {t(
                      "This request runs as you and changes real data in this workspace.",
                    )}
                  </Text>
                </Alert>
              )}
              {op.multipart &&
                multipartFields(op.body).map(([name, schema]) =>
                  isFileField(schema) ? (
                    <FileInput
                      key={name}
                      size="xs"
                      label={name}
                      placeholder={schema.description}
                      value={formFiles[name] ?? null}
                      onChange={(file) =>
                        setFormFiles((f) => ({ ...f, [name]: file }))
                      }
                      clearable
                    />
                  ) : schema.enum?.length ? (
                    <Select
                      key={name}
                      size="xs"
                      label={name}
                      data={schema.enum.map(String)}
                      value={formValues[name] ?? null}
                      onChange={(value) =>
                        setFormValues((v) => ({ ...v, [name]: value ?? "" }))
                      }
                    />
                  ) : (
                    <TextInput
                      key={name}
                      size="xs"
                      label={name}
                      value={formValues[name] ?? ""}
                      onChange={(e) => {
                        const value = e.currentTarget.value;
                        setFormValues((v) => ({ ...v, [name]: value }));
                      }}
                    />
                  ),
                )}
              {op.method !== "get" && !op.multipart && (
                <Textarea
                  value={payload}
                  onChange={(e) => setPayload(e.currentTarget.value)}
                  autosize
                  minRows={3}
                  maxRows={14}
                  error={jsonError}
                  styles={{ input: { fontFamily: "monospace", fontSize: 12 } }}
                  aria-label={t("Request body")}
                />
              )}
              <Group>
                <Button
                  size="xs"
                  leftSection={<IconPlayerPlay size={14} />}
                  onClick={send}
                  loading={sending}
                  disabled={op.pathParams.length > 0}
                >
                  {t("Send request")}
                </Button>
                {response && (
                  <Badge
                    color={
                      response.status >= 200 && response.status < 300
                        ? "green"
                        : "red"
                    }
                    variant="light"
                  >
                    {response.status || t("Network error")}
                  </Badge>
                )}
              </Group>
              {response && (
                <Code
                  block
                  style={{
                    maxHeight: 360,
                    overflow: "auto",
                    whiteSpace: "pre",
                  }}
                >
                  {response.body}
                </Code>
              )}
            </Stack>
          )}
        </Stack>
      </Accordion.Panel>
    </Accordion.Item>
  );
}
