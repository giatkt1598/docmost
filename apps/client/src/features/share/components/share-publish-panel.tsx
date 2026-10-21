import {
  ActionIcon,
  Anchor,
  Button,
  Group,
  Switch,
  Text,
  TextInput,
} from "@mantine/core";
import { IconExternalLink, IconLock } from "@tabler/icons-react";
import React, { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { useAtom } from "jotai";
import {
  useCreateShareMutation,
  useDeleteShareMutation,
  useShareForPageQuery,
  useUpdateShareMutation,
} from "@/features/share/queries/share-query.ts";
import { getPageIcon } from "@/lib";
import CopyTextButton from "@/components/common/copy.tsx";
import { getAppUrl, isCloud } from "@/lib/config.ts";
import { buildPageUrl } from "@/features/page/page.utils.ts";
import classes from "@/features/share/components/share.module.css";
import useTrial from "@/ee/hooks/use-trial.tsx";
import { workspaceAtom } from "@/features/user/atoms/current-user-atom.ts";
import { useSpaceQuery } from "@/features/space/queries/space-query.ts";

interface SharePublishPanelProps {
  pageId: string | undefined;
  readOnly: boolean;
  // restricted pages (or pages under one) cannot be shared publicly
  isRestricted?: boolean;
}

function Notice({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <>
      <Group justify="center" mb="sm">
        <IconLock size={20} stroke={1.5} />
      </Group>
      <Text size="sm" ta="center" fw={500} mb="xs">
        {title}
      </Text>
      <Text size="sm" c="dimmed" ta="center">
        {children}
      </Text>
    </>
  );
}

// "Share to web": the public link of a page and its options.
export function SharePublishPanel({
  pageId,
  readOnly,
  isRestricted,
}: SharePublishPanelProps) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { pageSlug, spaceSlug } = useParams();
  const { data: share } = useShareForPageQuery(pageId);
  const { isTrial } = useTrial();
  const [workspace] = useAtom(workspaceAtom);
  const { data: space } = useSpaceQuery(spaceSlug);
  const workspaceDisabled = workspace?.settings?.sharing?.disabled === true;
  const spaceDisabled = space?.settings?.sharing?.disabled === true;
  const createShareMutation = useCreateShareMutation();
  const updateShareMutation = useUpdateShareMutation();
  const deleteShareMutation = useDeleteShareMutation();
  // the share exists on this page itself (level 0) or on an ancestor
  const pageIsShared = share && share.level === 0;
  const isDescendantShared = share && share.level > 0;

  const publicLink = `${getAppUrl()}/share/${share?.key}/p/${pageSlug}`;

  const [isPagePublic, setIsPagePublic] = useState<boolean>(false);
  useEffect(() => {
    setIsPagePublic(!!share);
  }, [share, pageId]);

  const handleChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const value = event.currentTarget.checked;
    setIsPagePublic(value);

    try {
      if (value) {
        await createShareMutation.mutateAsync({
          pageId: pageId,
          includeSubPages: true,
          searchIndexing: false,
        });
      } else if (share && share.id) {
        await deleteShareMutation.mutateAsync(share.id);
      }
    } catch {
      setIsPagePublic(!value);
    }
  };

  const handleSubPagesChange = async (
    event: React.ChangeEvent<HTMLInputElement>,
  ) => {
    try {
      await updateShareMutation.mutateAsync({
        shareId: share.id,
        includeSubPages: event.currentTarget.checked,
      });
    } catch {
      // query invalidation will revert the UI
    }
  };

  const handleIndexSearchChange = async (
    event: React.ChangeEvent<HTMLInputElement>,
  ) => {
    try {
      await updateShareMutation.mutateAsync({
        shareId: share.id,
        searchIndexing: event.currentTarget.checked,
      });
    } catch {
      // query invalidation will revert the UI
    }
  };

  const shareLink = useMemo(
    () => (
      <Group my="sm" gap={4} wrap="nowrap">
        <TextInput
          variant="filled"
          value={publicLink}
          readOnly
          rightSection={<CopyTextButton text={publicLink} />}
          style={{ width: "100%" }}
        />
        <ActionIcon
          component="a"
          variant="default"
          target="_blank"
          href={publicLink}
          size="sm"
        >
          <IconExternalLink size={16} />
        </ActionIcon>
      </Group>
    ),
    [publicLink],
  );

  if (isCloud() && isTrial) {
    return (
      <>
        <Notice title={t("Upgrade to share pages")}>
          {t(
            "Page sharing is available on paid plans. Upgrade to share your pages publicly.",
          )}
        </Notice>
        <Button
          size="xs"
          mt="sm"
          onClick={() => navigate("/settings/billing")}
          fullWidth
        >
          {t("Upgrade Plan")}
        </Button>
      </>
    );
  }

  if (workspaceDisabled || spaceDisabled) {
    return (
      <Notice title={t("Public sharing is disabled")}>
        {workspaceDisabled
          ? t("Public sharing has been disabled at the workspace level.")
          : t("Public sharing has been disabled for this space.")}
      </Notice>
    );
  }

  if (isRestricted) {
    return (
      <Notice title={t("Restricted page")}>
        {t("Restricted pages cannot be shared publicly.")}
      </Notice>
    );
  }

  if (isDescendantShared) {
    return (
      <>
        <Text size="sm">{t("Inherits public sharing from")}</Text>
        <Anchor
          size="sm"
          underline="never"
          style={{ cursor: "pointer", color: "var(--mantine-color-text)" }}
          component={Link}
          to={buildPageUrl(
            spaceSlug,
            share.sharedPage.slugId,
            share.sharedPage.title,
          )}
        >
          <Group gap="4" wrap="nowrap" my="sm">
            {getPageIcon(share.sharedPage.icon)}
            <div className={classes.shareLinkText}>
              <Text fz="sm" fw={500} lineClamp={1}>
                {share.sharedPage.title || t("untitled")}
              </Text>
            </div>
          </Group>
        </Anchor>

        {shareLink}
      </>
    );
  }

  return (
    <>
      <Group justify="space-between" wrap="nowrap" gap="xl">
        <div>
          <Text size="sm">
            {isPagePublic ? t("Shared to web") : t("Share to web")}
          </Text>
          <Text size="xs" c="dimmed">
            {isPagePublic
              ? t("Anyone with the link can view this page")
              : t("Make this page publicly accessible")}
          </Text>
        </div>
        <Switch
          onChange={handleChange}
          checked={isPagePublic}
          disabled={readOnly}
          size="xs"
        />
      </Group>

      {pageIsShared && (
        <>
          {shareLink}
          <Group justify="space-between" wrap="nowrap" gap="xl">
            <div>
              <Text size="sm">{t("Include sub-pages")}</Text>
              <Text size="xs" c="dimmed">
                {t("Make sub-pages public too")}
              </Text>
            </div>

            <Switch
              onChange={handleSubPagesChange}
              checked={share.includeSubPages}
              size="xs"
              disabled={readOnly}
            />
          </Group>
          <Group justify="space-between" wrap="nowrap" gap="xl" mt="sm">
            <div>
              <Text size="sm">{t("Search engine indexing")}</Text>
              <Text size="xs" c="dimmed">
                {t("Allow search engines to index page")}
              </Text>
            </div>
            <Switch
              onChange={handleIndexSearchChange}
              checked={share.searchIndexing}
              size="xs"
              disabled={readOnly}
            />
          </Group>
        </>
      )}
    </>
  );
}
