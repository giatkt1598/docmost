import { useState } from "react";
import { Button, Group, Space, Text } from "@mantine/core";
import { useTranslation } from "react-i18next";
import Paginate from "@/components/common/paginate";
import { useCursorPaginate } from "@/hooks/use-cursor-paginate";
import { useApiKeysQuery } from "@/features/api-key/queries/api-key-query";
import {
  IApiKey,
  ICreatedApiKey,
} from "@/features/api-key/types/api-key.types";
import { ApiKeyTable } from "@/features/api-key/components/api-key-table";
import { CreateApiKeyModal } from "@/features/api-key/components/create-api-key-modal";
import { ApiKeyCreatedModal } from "@/features/api-key/components/api-key-created-modal";
import { RenameApiKeyModal } from "@/features/api-key/components/rename-api-key-modal";

interface ApiKeysPanelProps {
  // every key of the workspace (admin page) instead of the user's own
  adminView?: boolean;
  canCreate: boolean;
  description: string;
}

export function ApiKeysPanel({
  adminView,
  canCreate,
  description,
}: ApiKeysPanelProps) {
  const { t } = useTranslation();
  const { cursor, goNext, goPrev } = useCursorPaginate();
  const { data, isLoading } = useApiKeysQuery({ cursor, adminView });
  const [createOpened, setCreateOpened] = useState(false);
  const [created, setCreated] = useState<ICreatedApiKey | null>(null);
  const [renaming, setRenaming] = useState<IApiKey | null>(null);

  return (
    <>
      <Group justify="space-between" align="center" mb="md" wrap="nowrap">
        <Text size="sm" c="dimmed">
          {description}
        </Text>
        {canCreate && (
          <Button
            onClick={() => setCreateOpened(true)}
            style={{ flexShrink: 0 }}
          >
            {t("Create API key")}
          </Button>
        )}
      </Group>

      <ApiKeyTable
        apiKeys={data?.items ?? []}
        isLoading={isLoading}
        showCreator={adminView}
        onRename={setRenaming}
      />

      <Space h="md" />
      {(data?.meta?.hasNextPage || data?.meta?.hasPrevPage) && (
        <Paginate
          hasPrevPage={data?.meta?.hasPrevPage}
          hasNextPage={data?.meta?.hasNextPage}
          onNext={() => goNext(data?.meta?.nextCursor)}
          onPrev={goPrev}
        />
      )}

      <CreateApiKeyModal
        opened={createOpened}
        onClose={() => setCreateOpened(false)}
        onCreated={setCreated}
      />
      <ApiKeyCreatedModal apiKey={created} onClose={() => setCreated(null)} />
      <RenameApiKeyModal apiKey={renaming} onClose={() => setRenaming(null)} />
    </>
  );
}
