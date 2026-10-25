import type { CSSProperties } from "react";
import {
  PropertyChoice,
  CHOICE_PALETTE,
  PaletteColor,
  StatusGroup,
} from "@/features/base/types/base.types";

// Choice badges use Mantine's "light" variant colours, which follow the
// colour scheme through CSS variables.

export function isChoiceColor(color: unknown): color is PaletteColor {
  return (CHOICE_PALETTE as readonly string[]).includes(color as string);
}

export function normalizeChoiceColor(color: unknown): PaletteColor {
  return isChoiceColor(color) ? color : "gray";
}

export function choiceColorStyle(color: unknown): CSSProperties {
  const c = normalizeChoiceColor(color);
  return {
    backgroundColor: `var(--mantine-color-${c}-light)`,
    color: `var(--mantine-color-${c}-light-color)`,
  };
}

// Small coloured dot (status categories, colour pickers).
export function choiceDotStyle(color: unknown): CSSProperties {
  return {
    backgroundColor: `var(--mantine-color-${normalizeChoiceColor(color)}-filled)`,
  };
}

export const STATUS_CATEGORY_COLORS: Record<StatusGroup, PaletteColor> = {
  todo: "gray",
  inProgress: "blue",
  complete: "green",
};

// A colour for a new option: the first one not used yet, cycling after.
export function nextChoiceColor(choices: Pick<PropertyChoice, "color">[]): PaletteColor {
  const used = new Set(choices.map((c) => c.color));
  const palette = CHOICE_PALETTE.filter((c) => c !== "gray");
  const free = palette.find((c) => !used.has(c));
  return free ?? palette[choices.length % palette.length];
}

// Choices in display order: choiceOrder first, then any left out.
export function orderedChoices(options: {
  choices?: PropertyChoice[];
  choiceOrder?: string[];
} | null | undefined): PropertyChoice[] {
  const choices = options?.choices ?? [];
  const byId = new Map(choices.map((c) => [c.id, c]));
  const out: PropertyChoice[] = [];
  for (const id of options?.choiceOrder ?? []) {
    const c = byId.get(id);
    if (c) {
      out.push(c);
      byId.delete(id);
    }
  }
  for (const c of choices) if (byId.has(c.id)) out.push(c);
  return out;
}
