import { Group, Tooltip } from "@mantine/core";
import { IconCheck, IconFileText, IconPaperclip } from "@tabler/icons-react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";
import { CustomAvatar } from "@/components/ui/custom-avatar";
import {
  ChoiceOptions,
  DateOptions,
  FormulaOptions,
  NumberOptions,
} from "@/features/base/types/base.types";
import { CellRendererProps } from "@/features/base/registry/property-types";
import { formatCellDate } from "@/features/base/utils/date-format";
import { formatNumberValue, progressPercent } from "@/features/base/utils/number-format";
import { orderedChoices } from "@/features/base/utils/choice-colors";
import {
  pageDisplayTitle,
  referencedPageUrl,
  referencedUser,
} from "@/features/base/utils/references";
import {
  asFileList,
  asStringList,
  fileUrl,
  isFormulaError,
  safeHref,
} from "@/features/base/utils/cell-values";
import { ChoiceChip } from "@/features/base/components/common/choice-chip";
import classes from "./cells.module.css";

export function TextValue({ value }: CellRendererProps) {
  if (typeof value !== "string" || !value) return null;
  return (
    <div className={classes.value}>
      <span className={classes.text}>{value}</span>
    </div>
  );
}

export function LongTextValue({ value }: CellRendererProps) {
  if (typeof value !== "string" || !value) return null;
  // first line only; the editor shows everything
  const firstLine = value.split("\n", 1)[0];
  return (
    <div className={classes.value} title={value.length > 200 ? undefined : value}>
      <span className={classes.text}>{firstLine}</span>
    </div>
  );
}

export function NumberValue({ value, property }: CellRendererProps) {
  const { i18n } = useTranslation();
  const opts = (property.typeOptions ?? {}) as NumberOptions;
  const text = formatNumberValue(value, opts, i18n.language);
  if (!text) return null;
  if (opts.format === "progress") {
    return (
      <div className={classes.value}>
        <div className={classes.progressTrack}>
          <div
            className={classes.progressBar}
            style={{ width: `${progressPercent(value)}%` }}
          />
        </div>
        <span>{text}</span>
      </div>
    );
  }
  return <div className={`${classes.value} ${classes.number}`}>{text}</div>;
}

export function ChoiceValue({ value, property }: CellRendererProps) {
  const opts = property.typeOptions as ChoiceOptions | null;
  const ids = asStringList(value);
  if (!ids.length) return null;
  const wanted = new Set(ids);
  // multi-select shows choices in option order
  const choices = orderedChoices(opts).filter((c) => wanted.has(c.id));
  return (
    <div className={classes.value}>
      {choices.map((c) => (
        <ChoiceChip key={c.id} choice={c} plain={opts?.disableColors} />
      ))}
    </div>
  );
}

export function DateValue({ value, property }: CellRendererProps) {
  const { i18n } = useTranslation();
  const text = formatCellDate(value, {
    ...((property.typeOptions ?? {}) as DateOptions),
    locale: i18n.language,
  });
  if (!text) return null;
  return (
    <div className={classes.value}>
      <span className={classes.text}>{text}</span>
    </div>
  );
}

export function CheckboxValue({ value }: CellRendererProps) {
  return (
    <div className={classes.value} style={{ justifyContent: "center" }}>
      <span
        role="checkbox"
        aria-checked={value === true}
        style={{
          display: "inline-flex",
          width: 16,
          height: 16,
          borderRadius: 4,
          alignItems: "center",
          justifyContent: "center",
          border: "1px solid var(--mantine-color-default-border)",
          background: value === true ? "var(--mantine-primary-color-filled)" : undefined,
          color: "var(--mantine-color-white)",
        }}
      >
        {value === true && <IconCheck size={12} stroke={3} />}
      </span>
    </div>
  );
}

export function LinkValue({ value, property }: CellRendererProps) {
  if (typeof value !== "string" || !value) return null;
  const href = safeHref(property.type === "email" ? `mailto:${value}` : value);
  return (
    <div className={classes.value}>
      {href ? (
        <a
          className={classes.link}
          href={href}
          target={property.type === "email" ? undefined : "_blank"}
          rel="noopener noreferrer"
          onClick={(e) => e.stopPropagation()}
        >
          {value}
        </a>
      ) : (
        <span className={classes.text}>{value}</span>
      )}
    </div>
  );
}

export function PersonValue({ value, references }: CellRendererProps) {
  const { t } = useTranslation();
  const ids = asStringList(value);
  if (!ids.length) return null;
  return (
    <div className={classes.value}>
      {ids.map((id) => {
        const user = referencedUser(references, id);
        const name = user?.name?.trim() || t("Unknown user");
        return (
          <Group key={id} gap={4} wrap="nowrap" style={{ flexShrink: 0 }}>
            <CustomAvatar avatarUrl={user?.avatarUrl ?? undefined} name={name} size={18} />
            <span className={classes.text}>{name}</span>
          </Group>
        );
      })}
    </div>
  );
}

export function PageValue({ value, references }: CellRendererProps) {
  const { t } = useTranslation();
  const ids = asStringList(value);
  if (!ids.length) return null;
  return (
    <div className={classes.value}>
      {ids.map((id) => {
        const title = pageDisplayTitle(references, id, t("Untitled"));
        const url = referencedPageUrl(references, id);
        if (!title) {
          return (
            <span key={id} className={classes.muted}>
              {t("No access")}
            </span>
          );
        }
        return (
          <Group key={id} gap={4} wrap="nowrap" style={{ minWidth: 0 }}>
            <IconFileText size={14} style={{ flexShrink: 0 }} />
            {url ? (
              <Link className={classes.link} to={url} onClick={(e) => e.stopPropagation()}>
                {title}
              </Link>
            ) : (
              <span className={classes.text}>{title}</span>
            )}
          </Group>
        );
      })}
    </div>
  );
}

export function FileValue({ value }: CellRendererProps) {
  const files = asFileList(value);
  if (!files.length) return null;
  return (
    <div className={classes.value}>
      {files.map((f) => (
        <a
          key={f.id}
          className={`${classes.badge} ${classes.plainBadge}`}
          href={fileUrl(f)}
          target="_blank"
          rel="noopener noreferrer"
          onClick={(e) => e.stopPropagation()}
          title={f.fileName}
        >
          <IconPaperclip size={12} style={{ marginRight: 2 }} />
          {f.fileName}
        </a>
      ))}
    </div>
  );
}

export function FormulaValue(props: CellRendererProps) {
  const { value, property } = props;
  const { i18n } = useTranslation();
  if (value === null || value === undefined) return null;
  if (isFormulaError(value)) {
    return (
      <Tooltip label={value.__err} withinPortal multiline maw={320}>
        <div className={`${classes.value} ${classes.error}`}>#ERROR</div>
      </Tooltip>
    );
  }
  const opts = (property.typeOptions ?? {}) as FormulaOptions;
  switch (opts.resultType) {
    case "number":
      return (
        <div className={`${classes.value} ${classes.number}`}>
          {formatNumberValue(value, (opts.formatOptions ?? {}) as NumberOptions, i18n.language)}
        </div>
      );
    case "boolean":
      return <CheckboxValue {...props} />;
    case "date":
      return (
        <div className={classes.value}>
          {formatCellDate(value, {
            ...((opts.formatOptions ?? {}) as DateOptions),
            includeTime: (opts.formatOptions as DateOptions | undefined)?.includeTime ?? true,
            locale: i18n.language,
          })}
        </div>
      );
    default:
      return (
        <div className={classes.value}>
          <span className={classes.text}>{String(value)}</span>
        </div>
      );
  }
}
