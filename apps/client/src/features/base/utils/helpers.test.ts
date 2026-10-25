import { describe, expect, it } from "vitest";
import { Base, RowReferenceMap } from "@/features/base/types/base.types";
import {
  choiceColorStyle,
  isChoiceColor,
  nextChoiceColor,
  normalizeChoiceColor,
  orderedChoices,
} from "./choice-colors";
import {
  asIdList,
  pageDisplayTitle,
  referencedPageUrl,
  userDisplayName,
  withReferences,
} from "./references";
import { fileNameFromDisposition } from "./download";
import { normalizeRowQuery } from "./rows-params";
import { comparePositions, positionBetween, sortByPosition } from "./position";
import {
  mergeViewConfig,
  patchPropertyInBase,
  patchViewInBase,
  removePropertyFromBase,
  upsertPropertyInBase,
} from "./info-cache";
import { baseKeys } from "@/features/base/queries/base-query-keys";

describe("choice colours", () => {
  it("maps Mantine colour names to light variant variables", () => {
    expect(choiceColorStyle("red")).toEqual({
      backgroundColor: "var(--mantine-color-red-light)",
      color: "var(--mantine-color-red-light-color)",
    });
    expect(choiceColorStyle("purple")).toEqual(choiceColorStyle("gray"));
    expect(isChoiceColor("teal")).toBe(true);
    expect(normalizeChoiceColor(undefined)).toBe("gray");
  });

  it("picks an unused colour for new options", () => {
    expect(nextChoiceColor([])).toBe("red");
    expect(nextChoiceColor([{ color: "red" }, { color: "pink" }])).toBe("grape");
  });

  it("orders choices by choiceOrder, keeping the rest", () => {
    const choices = [
      { id: "a", name: "A", color: "red" },
      { id: "b", name: "B", color: "red" },
      { id: "c", name: "C", color: "red" },
    ];
    expect(orderedChoices({ choices, choiceOrder: ["c", "ghost", "a"] }).map((c) => c.id)).toEqual([
      "c",
      "a",
      "b",
    ]);
    expect(orderedChoices(null)).toEqual([]);
  });
});

describe("references", () => {
  const refs: RowReferenceMap = {
    users: { u1: { id: "u1", name: "Ann", avatarUrl: null }, u2: { id: "u2", name: " ", avatarUrl: null } },
    pages: {
      p1: { id: "p1", slugId: "abc", title: "Plan", icon: null, spaceId: "s", space: { id: "s", slug: "eng", name: "Eng" } },
      p2: { id: "p2", slugId: "def", title: null, icon: null, spaceId: "s", space: null },
    },
  };

  it("reads user names and page titles", () => {
    expect(userDisplayName(refs, "u1")).toBe("Ann");
    expect(userDisplayName(refs, "u2", "Unknown")).toBe("Unknown");
    expect(userDisplayName(refs, "nobody", "Unknown")).toBe("Unknown");
    expect(pageDisplayTitle(refs, "p1")).toBe("Plan");
    expect(pageDisplayTitle(refs, "p2", "Untitled")).toBe("Untitled");
    expect(pageDisplayTitle(refs, "nope")).toBeNull();
  });

  it("builds page links when the space is known", () => {
    expect(referencedPageUrl(refs, "p1")).toBe("/s/eng/p/plan-abc");
    expect(referencedPageUrl(refs, "p2")).toBeNull();
  });

  it("normalizes id lists and merges references", () => {
    expect(asIdList("a")).toEqual(["a"]);
    expect(asIdList(["a", 1, "", "b"])).toEqual(["a", "b"]);
    expect(asIdList(null)).toEqual([]);
    const merged = withReferences(refs, { users: { u3: { id: "u3", name: "C", avatarUrl: null } } });
    expect(Object.keys(merged.users)).toEqual(["u1", "u2", "u3"]);
    expect(Object.keys(merged.pages)).toEqual(["p1", "p2"]);
  });
});

describe("misc helpers", () => {
  it("reads file names from Content-Disposition", () => {
    expect(fileNameFromDisposition("attachment; filename*=UTF-8''My%20base%20%C3%A9.csv")).toBe(
      "My base é.csv",
    );
    expect(fileNameFromDisposition('attachment; filename="plain.csv"')).toBe("plain.csv");
    expect(fileNameFromDisposition(undefined)).toBeNull();
  });

  it("normalizes row query params into stable keys", () => {
    expect(normalizeRowQuery({ filter: { op: "and", children: [] }, sorts: [], search: "  " })).toEqual({});
    expect(normalizeRowQuery({ search: " q " })).toEqual({ search: "q" });
    expect(baseKeys.rows("b", { sorts: [] })).toEqual(baseKeys.rows("b"));
  });

  it("compares and generates positions", () => {
    expect(comparePositions("a0", "a1")).toBe(-1);
    expect(comparePositions("Zz", "a0")).toBe(-1);
    expect(comparePositions("a0", "a0")).toBe(0);
    const between = positionBetween("a0", "a1");
    expect(comparePositions("a0", between)).toBe(-1);
    expect(comparePositions(between, "a1")).toBe(-1);
    expect(comparePositions(positionBetween(null, "a0"), "a0")).toBe(-1);
    expect(
      sortByPosition([
        { id: "2", position: "a1" },
        { id: "1", position: "a0" },
        { id: "0", position: "a1" },
      ]).map((x) => x.id),
    ).toEqual(["1", "0", "2"]);
  });
});

describe("info cache helpers", () => {
  const base = {
    properties: [{ id: "p1", name: "A", position: "a0" }],
    views: [{ id: "v1", name: "T", config: { sorts: [{ propertyId: "p1", direction: "asc" }], groupByPropertyId: "p1" } }],
  } as unknown as Base;

  it("merges view config patches like the server", () => {
    expect(mergeViewConfig({ groupByPropertyId: "x", hiddenPropertyIds: ["a"] }, { groupByPropertyId: null, choiceOrder: ["c"] })).toEqual({
      hiddenPropertyIds: ["a"],
      choiceOrder: ["c"],
    });
    const out = patchViewInBase(base, "v1", { name: "Board", config: { sorts: null } });
    expect(out.views[0]).toMatchObject({ name: "Board", config: { groupByPropertyId: "p1" } });
    expect(out.views[0].config.sorts).toBeUndefined();
    expect(patchViewInBase(base, "missing", { name: "x" })).toBe(base);
  });

  it("upserts, patches and removes properties by id", () => {
    const added = upsertPropertyInBase(base, { id: "p2" } as any);
    expect(added.properties.map((p) => p.id)).toEqual(["p1", "p2"]);
    expect(upsertPropertyInBase(added, { id: "p2", name: "B" } as any).properties).toHaveLength(2);
    expect(patchPropertyInBase(base, "p1", { name: "Z" }).properties[0].name).toBe("Z");
    expect(removePropertyFromBase(base, "p1").properties).toEqual([]);
    expect(removePropertyFromBase(base, "nope")).toBe(base);
  });
});
