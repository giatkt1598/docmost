import { KeyboardEvent, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  ActionIcon,
  Button,
  Divider,
  Group,
  Loader,
  Modal,
  ScrollArea,
  TextInput,
} from "@mantine/core";
import { useDebouncedValue } from "@mantine/hooks";
import {
  IconChevronRight,
  IconSearch,
  IconTemplate,
  IconWorld,
} from "@tabler/icons-react";
import { useTranslation } from "react-i18next";
import { CustomAvatar } from "@/components/ui/custom-avatar";
import { AvatarIconType } from "@/features/attachments/types/attachment.types";
import { useGetSpacesQuery } from "@/features/space/queries/space-query";
import { ISpace } from "@/features/space/types/space.types";
import { buildPageUrl } from "@/features/page/page.utils.ts";
import {
  useCreatePageFromTemplateMutation,
  useTemplatesQuery,
} from "@/features/template/queries/template-query";
import { ITemplate } from "@/features/template/types/template.types";
import classes from "@/components/ui/destination-picker/destination-picker.module.css";

interface NewPageFromTemplateModalProps {
  opened: boolean;
  onClose: () => void;
  // Space the new page is created in (the current space).
  spaceId: string;
  spaceSlug?: string;
  // The new page becomes a child of this page.
  parentPageId: string;
}

// Lists templates per space (current space expanded) and creates a child page
// from the chosen one.
export function NewPageFromTemplateModal({
  opened,
  onClose,
  spaceId,
  spaceSlug,
  parentPageId,
}: NewPageFromTemplateModalProps) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const createPageMutation = useCreatePageFromTemplateMutation();
  const [selected, setSelected] = useState<ITemplate | null>(null);
  const { data: spacesData, isLoading } = useGetSpacesQuery({ limit: 100 });
  const [search, setSearch] = useState("");
  const [debouncedSearch] = useDebouncedValue(search.trim(), 300);

  useEffect(() => {
    if (!opened) {
      setSelected(null);
      setSearch("");
    }
  }, [opened]);

  const handleCreate = async () => {
    if (!selected) return;
    const page = await createPageMutation.mutateAsync({
      templateId: selected.id,
      spaceId,
      parentPageId,
    });
    onClose();
    navigate(buildPageUrl(spaceSlug, page.slugId, page.title ?? undefined));
  };

  const spaces = spacesData?.items ?? [];
  // current space first
  const ordered = [
    ...spaces.filter((s) => s.id === spaceId),
    ...spaces.filter((s) => s.id !== spaceId),
  ];

  return (
    <Modal.Root
      opened={opened}
      onClose={onClose}
      size={550}
      padding="lg"
      yOffset="10vh"
      onClick={(e) => e.stopPropagation()}
    >
      <Modal.Overlay />
      <Modal.Content>
        <Modal.Header py={0}>
          <Modal.Title fw={500}>{t("New page from template")}</Modal.Title>
          <Modal.CloseButton aria-label={t("Close")} />
        </Modal.Header>
        <Modal.Body>
          <TextInput
            leftSection={<IconSearch size={16} />}
            placeholder={t("Search templates...")}
            aria-label={t("Search templates...")}
            variant="filled"
            value={search}
            onChange={(e) => setSearch(e.currentTarget.value)}
            className={classes.searchInput}
            data-autofocus
          />

          <ScrollArea h="50vh" offsetScrollbars className={classes.scrollArea}>
            {debouncedSearch ? (
              <TemplateRows
                query={debouncedSearch}
                selectedId={selected?.id ?? null}
                onSelect={setSelected}
                showSpace
              />
            ) : isLoading ? (
              <div className={classes.emptyState}>
                <Loader size="xs" />
              </div>
            ) : (
              <>
                {ordered.map((space) => (
                  <TemplateSpaceRow
                    key={space.id}
                    space={space}
                    defaultExpanded={space.id === spaceId}
                    selectedId={selected?.id ?? null}
                    onSelect={setSelected}
                  />
                ))}
                <TemplateSpaceRow
                  space={null}
                  defaultExpanded={false}
                  selectedId={selected?.id ?? null}
                  onSelect={setSelected}
                />
              </>
            )}
          </ScrollArea>

          <Divider my="md" />

          <Group justify="flex-end">
            <Button variant="default" onClick={onClose}>
              {t("Close")}
            </Button>
            <Button
              onClick={handleCreate}
              disabled={!selected}
              loading={createPageMutation.isPending}
            >
              {t("Create page")}
            </Button>
          </Group>
        </Modal.Body>
      </Modal.Content>
    </Modal.Root>
  );
}

function TemplateSpaceRow({
  space,
  defaultExpanded,
  selectedId,
  onSelect,
}: {
  // null = workspace-wide (global) templates
  space: ISpace | null;
  defaultExpanded: boolean;
  selectedId: string | null;
  onSelect: (template: ITemplate) => void;
}) {
  const { t } = useTranslation();
  const [expanded, setExpanded] = useState(defaultExpanded);
  const toggle = () => setExpanded((v) => !v);

  const handleKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.target !== e.currentTarget) return;
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      toggle();
    }
  };

  return (
    <>
      <div
        className={classes.spaceRow}
        data-space-id={space?.id}
        role="button"
        tabIndex={0}
        onClick={toggle}
        onKeyDown={handleKeyDown}
      >
        <ActionIcon
          className={`${classes.chevron} ${expanded ? classes.chevronExpanded : ""}`}
          variant="subtle"
          color="gray"
          size="sm"
          aria-label={expanded ? t("Collapse") : t("Expand")}
          aria-expanded={expanded}
          onClick={(e) => {
            e.stopPropagation();
            toggle();
          }}
        >
          <IconChevronRight size={14} />
        </ActionIcon>
        {space ? (
          <CustomAvatar
            name={space.name}
            avatarUrl={space.logo}
            type={AvatarIconType.SPACE_ICON}
            size={22}
          />
        ) : (
          <IconWorld size={20} />
        )}
        <div className={classes.pageTitle}>{space ? space.name : t("Global")}</div>
      </div>

      {expanded && (
        <TemplateRows
          spaceId={space?.id}
          selectedId={selectedId}
          onSelect={onSelect}
        />
      )}
    </>
  );
}

function TemplateRows({
  spaceId,
  query,
  selectedId,
  onSelect,
  showSpace,
}: {
  spaceId?: string;
  query?: string;
  selectedId: string | null;
  onSelect: (template: ITemplate) => void;
  // search results span spaces, so label each with its space
  showSpace?: boolean;
}) {
  const { t } = useTranslation();
  const { data, isLoading, hasNextPage, fetchNextPage } = useTemplatesQuery({
    spaceId,
    query,
  });
  const { data: spacesData } = useGetSpacesQuery({ limit: 100 });

  if (isLoading) {
    return (
      <div className={classes.emptyState}>
        <Loader size="xs" />
      </div>
    );
  }

  let templates = data?.pages.flatMap((page) => page.items) ?? [];
  // without a space filter the API returns everything accessible
  if (!spaceId && !query) templates = templates.filter((tpl) => !tpl.spaceId);

  if (templates.length === 0 && !hasNextPage) {
    return <div className={classes.emptyState}>{t("No templates found")}</div>;
  }

  return (
    <>
      {templates.map((template) => (
        <div
          key={template.id}
          className={[
            classes.pageRow,
            template.id === selectedId && classes.selected,
          ]
            .filter(Boolean)
            .join(" ")}
          style={{ paddingLeft: showSpace ? 12 : 32 }}
          role="button"
          tabIndex={0}
          onClick={() => onSelect(template)}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") {
              e.preventDefault();
              onSelect(template);
            }
          }}
        >
          <div className={classes.iconWrapper}>
            {template.icon ? template.icon : <IconTemplate size={18} />}
          </div>
          <div className={classes.pageTitle}>
            {template.title || t("Untitled")}
          </div>
          {showSpace && (
            <div className={classes.spaceName}>
              {template.spaceId
                ? (spacesData?.items.find((sp) => sp.id === template.spaceId)
                    ?.name ?? t("Space"))
                : t("Global")}
            </div>
          )}
        </div>
      ))}
      {hasNextPage && (
        <div
          className={classes.loadMore}
          role="button"
          tabIndex={0}
          onClick={() => fetchNextPage()}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") {
              e.preventDefault();
              fetchNextPage();
            }
          }}
        >
          {t("Load more")}
        </div>
      )}
    </>
  );
}
