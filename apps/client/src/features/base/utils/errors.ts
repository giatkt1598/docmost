import { notifications } from "@mantine/notifications";

// The server answers 400 with a useful message for invalid cells, filters
// and formulas, and 409 while a property is being converted.
export function apiErrorMessage(error: unknown): string | null {
  const message = (error as any)?.response?.data?.message;
  if (Array.isArray(message)) return message.join(", ");
  return typeof message === "string" && message ? message : null;
}

export function apiErrorStatus(error: unknown): number | null {
  const status = (error as any)?.response?.status;
  return typeof status === "number" ? status : null;
}

export function notifyBaseError(error: unknown, fallback: string) {
  notifications.show({
    message: apiErrorMessage(error) ?? fallback,
    color: "red",
  });
}
