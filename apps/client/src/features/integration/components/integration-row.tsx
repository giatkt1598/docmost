import {
  Group,
  Text,
  Badge,
  Button,
  Box,
  Stack,
  Tooltip,
} from "@mantine/core";
import { useTranslation } from "react-i18next";
import {
  IntegrationDefinition,
  Integration,
} from "../types/integration.types";
import { getIntegrationIcon } from "./integration-icons";
import { useHasFeature } from "@/ee/hooks/use-feature";
import { useUpgradeLabel } from "@/ee/hooks/use-upgrade-label";
import { Feature } from "@/ee/features";
import { isCloud } from "@/lib/config.ts";

// Keep in sync with apps/server/src/ee/licence/feature-registry.ts.
const MINIMUM_PLAN: Record<string, { selfHosted: string; cloud: string }> = {
  [Feature.INTEGRATIONS]: { selfHosted: "Business", cloud: "Standard" },
  [Feature.INTEGRATIONS_ADVANCED]: { selfHosted: "Enterprise", cloud: "Business" },
};

type IntegrationRowProps = {
  definition: IntegrationDefinition;
  installation?: Integration;
  configured: boolean;
  onConfigure: (type: string) => void;
  onInstall: (type: string) => void;
  onUninstall: (integrationId: string) => void;
};

export default function IntegrationRow({
  definition,
  installation,
  configured,
  onConfigure,
  onInstall,
  onUninstall,
}: IntegrationRowProps) {
  const { t } = useTranslation();
  const isInstalled = !!installation;
  const hasAccess = useHasFeature(definition.requiresFeature ?? "");
  const locked = !!definition.requiresFeature && !hasAccess;
  const upgradeLabel = useUpgradeLabel();
  const minimumPlan = MINIMUM_PLAN[definition.requiresFeature ?? ""];

  return (
    <Box
      py="sm"
      px="xs"
      style={{
        borderBottom: "1px solid var(--mantine-color-default-border)",
      }}
    >
      <Group justify="space-between" wrap="nowrap">
        <Group gap="sm" wrap="nowrap" style={{ flex: 1, minWidth: 0 }}>
          {getIntegrationIcon(definition.type, 28)}
          <Stack gap={2} style={{ minWidth: 0 }}>
            <Group gap="xs" wrap="nowrap">
              <Text size="sm" fw={500}>
                {definition.name}
              </Text>
              {locked && (
                <Badge size="xs" variant="light" color="violet">
                  {minimumPlan
                    ? t(isCloud() ? minimumPlan.cloud : minimumPlan.selfHosted)
                    : t("Paid")}
                </Badge>
              )}
              {!locked && !configured && (
                <Badge size="xs" variant="light" color="gray">
                  {t("Not configured")}
                </Badge>
              )}
            </Group>
            <Text size="xs" c="dimmed" truncate>
              {definition.description}
            </Text>
          </Stack>
        </Group>

        <Group gap="sm" wrap="nowrap" style={{ flexShrink: 0 }}>
          <Button
            size="xs"
            variant="default"
            disabled={locked}
            onClick={() => onConfigure(definition.type)}
          >
            {t("Configure")}
          </Button>
          {isInstalled ? (
            <Button
              size="xs"
              variant="default"
              onClick={() => onUninstall(installation.id)}
            >
              {t("Uninstall")}
            </Button>
          ) : (
            <Tooltip
              label={locked ? upgradeLabel : t("Configure this integration first")}
              disabled={!locked && configured}
            >
              <Button
                size="xs"
                variant="light"
                disabled={locked || !configured}
                onClick={() => onInstall(definition.type)}
              >
                {t("Install")}
              </Button>
            </Tooltip>
          )}
        </Group>
      </Group>
    </Box>
  );
}
