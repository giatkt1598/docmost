import { useState } from "react";
import { ActionIcon, Group, Paper, Textarea, Tooltip } from "@mantine/core";
import { IconArrowUp, IconPlayerStopFilled } from "@tabler/icons-react";
import { useTranslation } from "react-i18next";

interface ChatInputProps {
  onSend: (message: string) => void;
  onStop?: () => void;
  streaming?: boolean;
  placeholder?: string;
  autoFocus?: boolean;
}

// Enter sends, Shift+Enter adds a line.
export function ChatInput({
  onSend,
  onStop,
  streaming,
  placeholder,
  autoFocus,
}: ChatInputProps) {
  const { t } = useTranslation();
  const [value, setValue] = useState("");

  const submit = () => {
    if (!value.trim() || streaming) return;
    onSend(value);
    setValue("");
  };

  return (
    <Paper withBorder radius="lg" p={6}>
      <Group gap={6} align="flex-end" wrap="nowrap">
        <Textarea
          style={{ flex: 1 }}
          variant="unstyled"
          px="xs"
          autosize
          minRows={1}
          maxRows={8}
          value={value}
          onChange={(e) => setValue(e.currentTarget.value)}
          onKeyDown={(e) => {
            if (
              e.key === "Enter" &&
              !e.shiftKey &&
              !e.nativeEvent.isComposing
            ) {
              e.preventDefault();
              submit();
            }
          }}
          placeholder={placeholder ?? t("Ask anything about your pages...")}
          autoFocus={autoFocus}
          aria-label={t("Message")}
        />
        {streaming ? (
          <Tooltip label={t("Stop")}>
            <ActionIcon
              size="lg"
              radius="xl"
              variant="default"
              onClick={onStop}
              aria-label={t("Stop")}
            >
              <IconPlayerStopFilled size={14} />
            </ActionIcon>
          </Tooltip>
        ) : (
          <ActionIcon
            size="lg"
            radius="xl"
            onClick={submit}
            disabled={!value.trim()}
            aria-label={t("Send")}
          >
            <IconArrowUp size={18} />
          </ActionIcon>
        )}
      </Group>
    </Paper>
  );
}
