import { afterEach, describe, expect, it } from "vitest";
import { isSuggestionMenuKey } from "./suggestion-menu-keys";

function openMenu(id: string) {
  const el = document.createElement("div");
  el.id = id;
  document.body.appendChild(el);
}

const key = (key: string) => new KeyboardEvent("keydown", { key });

describe("isSuggestionMenuKey", () => {
  afterEach(() => {
    document.body.innerHTML = "";
  });

  it("ignores keys when no menu is open", () => {
    expect(isSuggestionMenuKey(key("Enter"))).toBe(false);
  });

  it("claims Enter and vertical arrows while the slash menu is open", () => {
    openMenu("slash-command");
    expect(isSuggestionMenuKey(key("Enter"))).toBe(true);
    expect(isSuggestionMenuKey(key("ArrowDown"))).toBe(true);
    expect(isSuggestionMenuKey(key("ArrowLeft"))).toBe(false);
    expect(isSuggestionMenuKey(key("a"))).toBe(false);
  });

  it("also claims horizontal arrows while the emoji menu is open", () => {
    openMenu("emoji-command");
    expect(isSuggestionMenuKey(key("ArrowLeft"))).toBe(true);
    expect(isSuggestionMenuKey(key("Enter"))).toBe(true);
  });
});
