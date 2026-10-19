import i18n from "@/i18n.ts";
import { VerificationStatus } from "@/features/page-verification/types/page-verification.types";

export function getVerificationColor(status: VerificationStatus): string {
  switch (status) {
    case "verified":
      return "blue";
    case "expiring":
      return "orange";
    case "expired":
      return "red";
    default:
      return "gray";
  }
}

export function getVerificationLabel(
  status: VerificationStatus,
  t: (key: string) => string,
): string {
  switch (status) {
    case "verified":
      return t("Verified");
    case "expiring":
      return t("Review needed");
    case "expired":
      return t("Verification expired");
    default:
      return t("Not verified");
  }
}

export function formatVerificationDate(date?: string | null): string {
  if (!date) return "";
  return new Date(date).toLocaleDateString(i18n.language, {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}
