import { ReactNode } from "react";
import { Group, Text } from "@mantine/core";

interface SettingRowProps {
  title: string;
  description?: ReactNode;
  children: ReactNode;
}

// Title and description on the left, the control on the right.
export function SettingRow({ title, description, children }: SettingRowProps) {
  return (
    <Group justify="space-between" wrap="nowrap" gap="xl">
      <div>
        <Text size="md">{title}</Text>
        {description && (
          <Text size="sm" c="dimmed">
            {description}
          </Text>
        )}
      </div>
      {children}
    </Group>
  );
}
