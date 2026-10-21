import { useState } from "react";
import { Button, Group, NumberInput, Select, Stack } from "@mantine/core";
import { DateInput } from "@mantine/dates";
import { useTranslation } from "react-i18next";
import { useAtomValue } from "jotai";
import { currentUserAtom } from "@/features/user/atoms/current-user-atom.ts";
import { VerifierSelect } from "@/features/page-verification/components/verifier-select";
import {
  IPageVerification,
  IVerificationSettings,
  IVerificationUser,
  PeriodUnit,
  VerificationMode,
} from "@/features/page-verification/types/page-verification.types";

interface VerificationSettingsFormProps {
  verification?: IPageVerification;
  submitLabel: string;
  loading?: boolean;
  onSubmit: (settings: IVerificationSettings) => void;
  onCancel: () => void;
}

export function VerificationSettingsForm({
  verification,
  submitLabel,
  loading,
  onSubmit,
  onCancel,
}: VerificationSettingsFormProps) {
  const { t } = useTranslation();
  const [mode, setMode] = useState<VerificationMode>(
    verification?.mode ?? "period",
  );
  const [periodAmount, setPeriodAmount] = useState<number>(
    verification?.periodAmount ?? 30,
  );
  const [periodUnit, setPeriodUnit] = useState<PeriodUnit>(
    verification?.periodUnit ?? "day",
  );
  const [fixedDate, setFixedDate] = useState<string | null>(
    verification?.mode === "fixed" && verification.expiresAt
      ? verification.expiresAt
      : null,
  );
  const currentUser = useAtomValue(currentUserAtom)?.user;
  // a new verification starts with the current user as verifier
  const [initialVerifiers] = useState<IVerificationUser[]>(
    () =>
      verification?.verifiers ??
      (currentUser
        ? [
            {
              id: currentUser.id,
              name: currentUser.name,
              email: currentUser.email,
              avatarUrl: currentUser.avatarUrl,
            },
          ]
        : []),
  );
  const [verifierIds, setVerifierIds] = useState<string[]>(
    initialVerifiers.map((v) => v.id),
  );

  const isValid =
    verifierIds.length > 0 &&
    (mode !== "period" || periodAmount >= 1) &&
    (mode !== "fixed" || !!fixedDate);

  const handleSubmit = () => {
    onSubmit({
      mode,
      verifierIds,
      ...(mode === "period" && { periodAmount, periodUnit }),
      ...(mode === "fixed" &&
        fixedDate && { fixedExpiresAt: new Date(fixedDate).toISOString() }),
    });
  };

  return (
    <Stack>
      <VerifierSelect
        value={verifierIds}
        onChange={setVerifierIds}
        initialUsers={initialVerifiers}
      />

      <Select
        label={t("Verification expires")}
        value={mode}
        onChange={(value) => value && setMode(value as VerificationMode)}
        allowDeselect={false}
        data={[
          { value: "period", label: t("On a recurring schedule") },
          { value: "fixed", label: t("On a specific date") },
          { value: "indefinite", label: t("Never") },
        ]}
        comboboxProps={{ withinPortal: true }}
      />

      {mode === "period" && (
        <Group grow align="flex-end">
          <NumberInput
            label={t("Re-verify every")}
            min={1}
            max={999}
            value={periodAmount}
            onChange={(value) => setPeriodAmount(Number(value) || 1)}
          />
          <Select
            value={periodUnit}
            onChange={(value) => value && setPeriodUnit(value as PeriodUnit)}
            allowDeselect={false}
            aria-label={t("Period unit")}
            data={[
              { value: "day", label: t("Days") },
              { value: "week", label: t("Weeks") },
              { value: "month", label: t("Months") },
              { value: "year", label: t("Years") },
            ]}
            comboboxProps={{ withinPortal: true }}
          />
        </Group>
      )}

      {mode === "fixed" && (
        <DateInput
          label={t("Expiry date")}
          value={fixedDate}
          onChange={setFixedDate}
          minDate={new Date(Date.now() + 24 * 60 * 60 * 1000)}
          valueFormat="LL"
          popoverProps={{ withinPortal: true }}
        />
      )}

      <Group justify="flex-end" mt="sm">
        <Button variant="default" onClick={onCancel}>
          {t("Cancel")}
        </Button>
        <Button onClick={handleSubmit} disabled={!isValid} loading={loading}>
          {submitLabel}
        </Button>
      </Group>
    </Stack>
  );
}
