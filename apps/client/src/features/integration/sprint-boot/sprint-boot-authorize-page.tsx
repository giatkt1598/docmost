import { useEffect, useState } from "react";
import { Button, Container, Group, Loader, Paper, Select, Stack, Text, TextInput, Title } from "@mantine/core";
import { useSearchParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { SprintBootIcon } from "@/components/icons";
import { useGetSpacesQuery } from "@/features/space/queries/space-query";
import { authorizeSprintBootLink, previewSprintBootLink } from "./sprint-boot-service";

const NEW_SPACE = "__new__";
const LATER = "";

// Where Sprint Boot sends its admin to link Docmost: pick the Docmost space (or make one) and the Sprint Boot space it
// keeps its documents for, then authorize.
export default function SprintBootAuthorizePage() {
  const { t } = useTranslation();
  const [params] = useSearchParams();
  const sprintBootUrl = (params.get("sprintBootUrl") ?? "").replace(/\/+$/, "");
  const state = params.get("state") ?? "";
  const { data: docmostSpaces } = useGetSpacesQuery({ limit: 100 });
  const [sprintBootSpaces, setSprintBootSpaces] = useState<{ key: string; name: string }[] | null>(null);
  const [failure, setFailure] = useState<string | null>(null);
  const [spaceKey, setSpaceKey] = useState<string>(LATER);
  const [docmostSpaceId, setDocmostSpaceId] = useState<string>(LATER);
  const [newSpaceName, setNewSpaceName] = useState("");
  const [pending, setPending] = useState(false);

  useEffect(() => {
    if (!sprintBootUrl || !state) return;
    previewSprintBootLink({ sprintBootUrl, state })
      .then((preview) => setSprintBootSpaces(preview.spaces))
      .catch((err: any) => setFailure(err?.response?.data?.message ?? t("Could not reach Sprint Boot")));
  }, [sprintBootUrl, state, t]);

  const creating = docmostSpaceId === NEW_SPACE;
  // Both spaces or neither: a half-chosen pair links nothing.
  const half = Boolean(spaceKey) !== Boolean(docmostSpaceId) || (creating && newSpaceName.trim().length < 2);

  const authorize = async () => {
    setPending(true);
    setFailure(null);
    try {
      const { returnUrl } = await authorizeSprintBootLink({
        sprintBootUrl,
        state,
        spaceKey: spaceKey || undefined,
        docmostSpaceId: creating ? undefined : docmostSpaceId || undefined,
        newSpaceName: creating ? newSpaceName.trim() : undefined,
      });
      window.location.assign(returnUrl);
    } catch (err: any) {
      setFailure(err?.response?.data?.message ?? t("Could not reach Sprint Boot"));
      setPending(false);
    }
  };

  return (
    // Centred on the screen, as a consent step.
    <Container size={520} py="xl" style={{ minHeight: "100vh", display: "flex", flexDirection: "column", justifyContent: "center" }}>
      <Paper withBorder p="lg" radius="md">
        <Stack gap="md">
          <Group gap="sm">
            <SprintBootIcon size={32} />
            <Title order={3}>{t("Connect Sprint Boot")}</Title>
          </Group>
          {!sprintBootUrl || !state ? (
            <Text c="red" size="sm">
              {t("This link request has expired. Start again from Sprint Boot's integrations page.")}
            </Text>
          ) : (
            <>
              <Text size="sm" c="dimmed">
                {t("Sprint Boot at {{url}} wants to connect to Docmost. Pick the spaces to link, or link them later.", {
                  url: sprintBootUrl,
                })}
              </Text>
              {!sprintBootSpaces && !failure && <Loader size="sm" />}
              {sprintBootSpaces && (
                <>
                  <Select
                    label={t("Docmost space")}
                    data={[
                      { value: LATER, label: t("Link later") },
                      ...(docmostSpaces?.items ?? []).map((space) => ({ value: space.id, label: space.name })),
                      { value: NEW_SPACE, label: t("Create a new space") },
                    ]}
                    value={docmostSpaceId}
                    onChange={(value) => setDocmostSpaceId(value ?? LATER)}
                    allowDeselect={false}
                  />
                  {creating && (
                    <TextInput
                      label={t("New space name")}
                      value={newSpaceName}
                      onChange={(event) => setNewSpaceName(event.currentTarget.value)}
                    />
                  )}
                  <Select
                    label={t("Sprint Boot space")}
                    data={[
                      { value: LATER, label: t("Link later") },
                      ...sprintBootSpaces.map((space) => ({ value: space.key, label: `${space.name} (${space.key})` })),
                    ]}
                    value={spaceKey}
                    onChange={(value) => setSpaceKey(value ?? LATER)}
                    allowDeselect={false}
                  />
                  {half && (
                    <Text size="sm" c="dimmed">
                      {t("Pick both spaces, or neither.")}
                    </Text>
                  )}
                </>
              )}
              {failure && (
                <Text c="red" size="sm">
                  {failure}
                </Text>
              )}
              <Group justify="flex-end">
                <Button variant="default" onClick={() => window.location.assign(`${sprintBootUrl}/admin/integrations`)}>
                  {t("Cancel")}
                </Button>
                <Button loading={pending} disabled={!sprintBootSpaces || half} onClick={authorize}>
                  {t("Authorize")}
                </Button>
              </Group>
            </>
          )}
        </Stack>
      </Paper>
    </Container>
  );
}
