import { useEffect, useState } from "react";
import {
  Alert,
  Avatar,
  Badge,
  Button,
  Group,
  Loader,
  Modal,
  Stack,
  Text,
  Tooltip,
} from "@mantine/core";
import { modals } from "@mantine/modals";
import { IconShieldCheck } from "@tabler/icons-react";
import { useTranslation } from "react-i18next";
import { CustomAvatar } from "@/components/ui/custom-avatar.tsx";
import {
  useCreateVerificationMutation,
  useDeleteVerificationMutation,
  usePageVerificationQuery,
  useUpdateVerificationMutation,
  useVerifyPageMutation,
} from "@/features/page-verification/queries/page-verification-query";
import { VerificationSettingsForm } from "@/features/page-verification/components/verification-settings-form";
import {
  formatVerificationDate,
  getVerificationColor,
  getVerificationLabel,
} from "@/features/page-verification/verification-status";
import {
  IPageVerification,
  IVerificationSettings,
} from "@/features/page-verification/types/page-verification.types";

interface PageVerificationModalProps {
  pageId: string;
  opened: boolean;
  onClose: () => void;
}

export function PageVerificationModal({
  pageId,
  opened,
  onClose,
}: PageVerificationModalProps) {
  const { t } = useTranslation();
  const { data: verification, isLoading } = usePageVerificationQuery(
    opened ? pageId : undefined,
  );
  const [editing, setEditing] = useState(false);

  useEffect(() => {
    if (!opened) setEditing(false);
  }, [opened]);

  const isSetUp = verification && verification.status !== "none";

  return (
    <Modal
      opened={opened}
      onClose={onClose}
      size={520}
      title={
        <Group gap="xs">
          <IconShieldCheck size={20} stroke={1.5} />
          <Text fw={600}>
            {isSetUp ? t("Page verification") : t("Set up verification")}
          </Text>
        </Group>
      }
    >
      {isLoading || !verification ? (
        <Group justify="center" p="md">
          <Loader size="sm" />
        </Group>
      ) : !isSetUp ? (
        <SetupView
          pageId={pageId}
          canManage={verification.permissions.canManage}
          onDone={onClose}
        />
      ) : editing ? (
        <EditView
          verification={verification}
          onDone={() => setEditing(false)}
        />
      ) : (
        <OverviewView
          verification={verification}
          onEdit={() => setEditing(true)}
          onRemoved={onClose}
        />
      )}
    </Modal>
  );
}

function SetupView({
  pageId,
  canManage,
  onDone,
}: {
  pageId: string;
  canManage: boolean;
  onDone: () => void;
}) {
  const { t } = useTranslation();
  const createMutation = useCreateVerificationMutation();

  if (!canManage) {
    return (
      <Text size="sm" c="dimmed">
        {t("This page is not verified.")}
      </Text>
    );
  }

  const handleSubmit = async (settings: IVerificationSettings) => {
    await createMutation.mutateAsync({ pageId, ...settings });
    onDone();
  };

  return (
    <Stack>
      <Text size="sm" c="dimmed">
        {t(
          "Verifiers re-confirm this page on a schedule so readers know it is still accurate. Setting it up marks the page as verified now.",
        )}
      </Text>
      <VerificationSettingsForm
        submitLabel={t("Set up verification")}
        loading={createMutation.isPending}
        onSubmit={handleSubmit}
        onCancel={onDone}
      />
    </Stack>
  );
}

function EditView({
  verification,
  onDone,
}: {
  verification: IPageVerification;
  onDone: () => void;
}) {
  const { t } = useTranslation();
  const updateMutation = useUpdateVerificationMutation();

  const handleSubmit = async (settings: IVerificationSettings) => {
    await updateMutation.mutateAsync({
      pageId: verification.pageId,
      ...settings,
    });
    onDone();
  };

  return (
    <VerificationSettingsForm
      verification={verification}
      submitLabel={t("Save")}
      loading={updateMutation.isPending}
      onSubmit={handleSubmit}
      onCancel={onDone}
    />
  );
}

function OverviewView({
  verification,
  onEdit,
  onRemoved,
}: {
  verification: IPageVerification;
  onEdit: () => void;
  onRemoved: () => void;
}) {
  const { t } = useTranslation();
  const verifyMutation = useVerifyPageMutation();
  const deleteMutation = useDeleteVerificationMutation();
  const { status, permissions } = verification;

  const openRemoveModal = () =>
    modals.openConfirmModal({
      title: t("Remove verification?"),
      centered: true,
      children: (
        <Text size="sm">
          {t("Verifiers will no longer be reminded to review this page.")}
        </Text>
      ),
      labels: { confirm: t("Remove"), cancel: t("Cancel") },
      confirmProps: { color: "red" },
      onConfirm: async () => {
        await deleteMutation.mutateAsync(verification.pageId);
        onRemoved();
      },
    });

  return (
    <Stack>
      <Group justify="space-between">
        <Badge color={getVerificationColor(status)} variant="light" size="lg">
          {getVerificationLabel(status, t)}
        </Badge>
        {verification.expiresAt && (
          <Text size="sm" c={status === "expired" ? "red" : "dimmed"}>
            {status === "expired"
              ? t("Expired on {{date}}", {
                  date: formatVerificationDate(verification.expiresAt),
                })
              : t("Expires on {{date}}", {
                  date: formatVerificationDate(verification.expiresAt),
                })}
          </Text>
        )}
      </Group>

      {status !== "verified" && (
        <Alert color={getVerificationColor(status)} variant="light">
          {status === "expired"
            ? t(
                "This page's verification has expired. A verifier should review it.",
              )
            : t("This page needs to be re-verified soon.")}
        </Alert>
      )}

      {verification.verifiedAt && (
        <Text size="sm">
          {verification.verifiedBy
            ? t("Last verified by {{name}} on {{date}}", {
                name: verification.verifiedBy.name,
                date: formatVerificationDate(verification.verifiedAt),
              })
            : t("Last verified on {{date}}", {
                date: formatVerificationDate(verification.verifiedAt),
              })}
        </Text>
      )}

      <div>
        <Text size="sm" fw={500} mb={6}>
          {t("Verifiers")}
        </Text>
        <Avatar.Group>
          {verification.verifiers?.map((v) => (
            <Tooltip key={v.id} label={v.name} withArrow>
              <CustomAvatar avatarUrl={v.avatarUrl} name={v.name} size={32} />
            </Tooltip>
          ))}
        </Avatar.Group>
      </div>

      <Group justify="space-between" mt="sm">
        <Group gap="xs">
          {permissions.canManage && (
            <>
              <Button variant="default" size="sm" onClick={onEdit}>
                {t("Edit")}
              </Button>
              <Button
                variant="subtle"
                color="red"
                size="sm"
                onClick={openRemoveModal}
              >
                {t("Remove")}
              </Button>
            </>
          )}
        </Group>
        {permissions.canVerify && (
          <Button
            leftSection={<IconShieldCheck size={16} />}
            loading={verifyMutation.isPending}
            onClick={() => verifyMutation.mutate(verification.pageId)}
          >
            {t("Verify page")}
          </Button>
        )}
      </Group>
    </Stack>
  );
}
