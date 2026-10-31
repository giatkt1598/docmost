import {
  ChoiceOptions,
  PaletteColor,
  PropertyChoice,
  StatusGroup,
} from "@/features/base/types/base.types";
import { nextChoiceColor, orderedChoices } from "@/features/base/utils/choice-colors";
import { newChoiceId } from "@/features/base/utils/cell-values";

// Edits of a choice list in the options editor. Every helper returns new
// options whose choiceOrder matches the choices exactly.

export function normalizeChoiceOptions(opts: Partial<ChoiceOptions> | null | undefined): ChoiceOptions {
  const ordered = orderedChoices({ choices: opts?.choices ?? [], choiceOrder: opts?.choiceOrder ?? [] });
  return {
    ...(opts ?? {}),
    choices: ordered,
    choiceOrder: ordered.map((c) => c.id),
  } as ChoiceOptions;
}

export function addChoice(
  opts: ChoiceOptions,
  name: string,
  withCategory: boolean,
): ChoiceOptions {
  const base = normalizeChoiceOptions(opts);
  const choice: PropertyChoice = {
    id: newChoiceId(),
    name: name.trim(),
    color: nextChoiceColor(base.choices),
    ...(withCategory ? { category: "todo" as StatusGroup } : {}),
  };
  return {
    ...base,
    choices: [...base.choices, choice],
    choiceOrder: [...base.choiceOrder, choice.id],
  };
}

export function updateChoice(
  opts: ChoiceOptions,
  id: string,
  patch: Partial<Pick<PropertyChoice, "name" | "color" | "category">>,
): ChoiceOptions {
  const base = normalizeChoiceOptions(opts);
  return {
    ...base,
    choices: base.choices.map((c) => (c.id === id ? { ...c, ...patch } : c)),
  };
}

export function setChoiceColor(opts: ChoiceOptions, id: string, color: PaletteColor) {
  return updateChoice(opts, id, { color });
}

export function moveChoice(opts: ChoiceOptions, from: number, to: number): ChoiceOptions {
  const base = normalizeChoiceOptions(opts);
  if (from === to || from < 0 || to < 0 || from >= base.choices.length || to >= base.choices.length) {
    return base;
  }
  const choices = [...base.choices];
  const [moved] = choices.splice(from, 1);
  choices.splice(to, 0, moved);
  return { ...base, choices, choiceOrder: choices.map((c) => c.id) };
}

export function removeChoice(opts: ChoiceOptions, id: string): ChoiceOptions {
  const base = normalizeChoiceOptions(opts);
  const choices = base.choices.filter((c) => c.id !== id);
  let defaultValue = base.defaultValue;
  if (Array.isArray(defaultValue)) defaultValue = defaultValue.filter((v) => v !== id);
  else if (defaultValue === id) defaultValue = null;
  return { ...base, choices, choiceOrder: choices.map((c) => c.id), defaultValue };
}

// Problems that block saving (the server would refuse or users would be
// confused by two options with the same name).
export function choiceListIssues(
  opts: Partial<ChoiceOptions> | null | undefined,
): "empty-name" | "duplicate-name" | null {
  const names = (opts?.choices ?? []).map((c) => c.name.trim().toLowerCase());
  if (names.some((n) => n === "")) return "empty-name";
  if (new Set(names).size !== names.length) return "duplicate-name";
  return null;
}
