import { useEffect, useState } from "react";
import { Button, Group, Modal, Select, Stack, TextInput } from "@mantine/core";
import { DateInput } from "@mantine/dates";
import { useTranslation } from "react-i18next";
import { useCreateApiKeyMutation } from "@/features/api-key/queries/api-key-query";
import { ICreatedApiKey } from "@/features/api-key/types/api-key.types";

interface CreateApiKeyModalProps {
  opened: boolean;
  onClose: () => void;
  onCreated: (apiKey: ICreatedApiKey) => void;
}

const DAY_MS = 24 * 60 * 60 * 1000;

export function CreateApiKeyModal({
  opened,
  onClose,
  onCreated,
}: CreateApiKeyModalProps) {
  const { t, i18n } = useTranslation();
  const create = useCreateApiKeyMutation();
  const [name, setName] = useState("");
  const [expiry, setExpiry] = useState("30");
  const [customDate, setCustomDate] = useState<string | null>(null);

  useEffect(() => {
    if (opened) {
      setName("");
      setExpiry("30");
      setCustomDate(null);
    }
  }, [opened]);

  const daysLabel = (days: number) =>
    t("{{days}} days ({{date}})", {
      days,
      date: new Date(Date.now() + days * DAY_MS).toLocaleDateString(
        i18n.language,
        { year: "numeric", month: "short", day: "numeric" },
      ),
    });

  const expiresAt = (): string | undefined => {
    if (expiry === "never") return undefined;
    if (expiry === "custom") {
      return customDate ? new Date(customDate).toISOString() : undefined;
    }
    return new Date(Date.now() + Number(expiry) * DAY_MS).toISOString();
  };

  const valid = !!name.trim() && (expiry !== "custom" || !!customDate);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!valid) return;
    const created = await create.mutateAsync({
      name: name.trim(),
      expiresAt: expiresAt(),
    });
    onClose();
    onCreated(created);
  };

  return (
    <Modal opened={opened} onClose={onClose} title={t("Create API key")}>
      <form onSubmit={onSubmit}>
        <Stack>
          <TextInput
            label={t("Name")}
            placeholder={t("e.g. CI pipeline")}
            value={name}
            onChange={(e) => setName(e.currentTarget.value)}
            maxLength={100}
            data-autofocus
            required
          />
          <Select
            label={t("Expiration")}
            value={expiry}
            onChange={(value) => value && setExpiry(value)}
            allowDeselect={false}
            data={[
              { value: "30", label: daysLabel(30) },
              { value: "60", label: daysLabel(60) },
              { value: "90", label: daysLabel(90) },
              { value: "365", label: daysLabel(365) },
              { value: "custom", label: t("Custom date") },
              { value: "never", label: t("No expiration") },
            ]}
            comboboxProps={{ withinPortal: true }}
          />
          {expiry === "custom" && (
            <DateInput
              label={t("Expiry date")}
              value={customDate}
              onChange={setCustomDate}
              minDate={new Date(Date.now() + DAY_MS)}
              maxDate={new Date(Date.now() + 365 * DAY_MS)}
              popoverProps={{ withinPortal: true }}
            />
          )}
          <Group justify="flex-end">
            <Button variant="default" onClick={onClose}>
              {t("Cancel")}
            </Button>
            <Button type="submit" disabled={!valid} loading={create.isPending}>
              {t("Create")}
            </Button>
          </Group>
        </Stack>
      </form>
    </Modal>
  );
}
