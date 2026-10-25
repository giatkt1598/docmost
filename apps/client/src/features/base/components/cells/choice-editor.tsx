import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { ChoiceOptions, PropertyChoice } from "@/features/base/types/base.types";
import { CellEditorProps } from "@/features/base/registry/property-types";
import { nextChoiceColor, orderedChoices } from "@/features/base/utils/choice-colors";
import { asStringList, newChoiceId, toggleInList } from "@/features/base/utils/cell-values";
import { useUpdatePropertyMutation } from "@/features/base/queries/base-property-query";
import { ChoiceChip } from "@/features/base/components/common/choice-chip";
import { PickerList } from "./picker-list";

// Select, status and multi-select picker with search and "create option".
export function ChoiceEditor({
  property,
  value,
  pageId,
  initialInput,
  commit,
  save,
  cancel,
}: CellEditorProps) {
  const { t } = useTranslation();
  const multi = property.type === "multiSelect";
  const opts = (property.typeOptions ?? { choices: [], choiceOrder: [] }) as ChoiceOptions;
  const [search, setSearch] = useState(initialInput ?? "");
  const [selected, setSelected] = useState<string[]>(asStringList(value));
  const updateProperty = useUpdatePropertyMutation(pageId);

  const choices = useMemo(() => orderedChoices(opts), [opts]);
  const query = search.trim().toLowerCase();
  const visible = choices.filter((c) => c.name.toLowerCase().includes(query));
  const exact = choices.some((c) => c.name.trim().toLowerCase() === query);
  const byId = new Map(choices.map((c) => [c.id, c]));

  const pick = (id: string) => {
    if (!multi) {
      commit(selected[0] === id ? null : id, "Enter");
      return;
    }
    const next = toggleInList(selected, id);
    setSelected(next);
    save(next.length ? next : null);
  };

  const create = async () => {
    const name = search.trim();
    if (!name) return;
    const choice: PropertyChoice = {
      id: newChoiceId(),
      name,
      color: nextChoiceColor(choices),
      ...(property.type === "status" ? { category: "todo" as const } : {}),
    };
    try {
      await updateProperty.mutateAsync({
        propertyId: property.id,
        typeOptions: {
          ...opts,
          choices: [...(opts.choices ?? []), choice],
          choiceOrder: [...(opts.choiceOrder ?? []), choice.id],
        },
      });
    } catch {
      return; // the mutation already showed the error
    }
    setSearch("");
    pick(choice.id);
  };

  return (
    <PickerList
      search={search}
      onSearch={setSearch}
      onEscape={cancel}
      loading={updateProperty.isPending}
      placeholder={multi ? t("Search or add options") : t("Search or add an option")}
      header={
        multi && selected.length > 0 ? (
          <div style={{ display: "flex", flexWrap: "wrap", gap: 4, marginBottom: 6 }}>
            {selected.map((id) => {
              const c = byId.get(id);
              return c ? (
                <span key={id} onClick={() => pick(id)} style={{ cursor: "pointer" }}>
                  <ChoiceChip choice={c} plain={opts.disableColors} />
                </span>
              ) : null;
            })}
          </div>
        ) : null
      }
      items={visible.map((c) => ({
        key: c.id,
        label: <ChoiceChip choice={c} plain={opts.disableColors} />,
        selected: selected.includes(c.id),
      }))}
      onPick={pick}
      createLabel={query && !exact ? t('Create "{{name}}"', { name: search.trim() }) : null}
      onCreate={create}
    />
  );
}
