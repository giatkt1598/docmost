import { MantineProvider } from "@mantine/core";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AnchoredPopover, escapeBelongsToLayer } from "./anchored-popover";

function setMediaMatch() {
  Object.defineProperty(window, "matchMedia", {
    configurable: true,
    value: vi.fn().mockImplementation((query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      addListener: vi.fn(),
      removeListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })),
  });
}

function setup() {
  const onClose = vi.fn();
  const anchor = document.createElement("button");
  anchor.textContent = "header";
  document.body.appendChild(anchor);
  render(
    <MantineProvider>
      <AnchoredPopover anchor={anchor} onClose={onClose}>
        <input aria-label="field" />
        <input aria-label="open list" aria-expanded="true" />
        <div role="listbox">
          <button>option</button>
        </div>
      </AnchoredPopover>
    </MantineProvider>,
  );
  return { onClose, anchor };
}

describe("AnchoredPopover", () => {
  beforeEach(setMediaMatch);
  afterEach(() => {
    cleanup();
    document.body.innerHTML = "";
  });

  it("renders its content next to an element that is already on the page", () => {
    setup();
    expect(screen.getByLabelText("field")).toBeTruthy();
  });

  it("closes on Escape", () => {
    const { onClose } = setup();
    fireEvent.keyDown(screen.getByLabelText("field"), { key: "Escape" });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("leaves Escape to an open list or menu first", () => {
    const { onClose } = setup();
    fireEvent.keyDown(screen.getByLabelText("open list"), { key: "Escape" });
    fireEvent.keyDown(screen.getByText("option"), { key: "Escape" });
    expect(onClose).not.toHaveBeenCalled();
  });

  it("closes on an outside click but not inside, on the anchor, or in a list", () => {
    const { onClose, anchor } = setup();
    fireEvent.mouseDown(screen.getByLabelText("field"));
    fireEvent.mouseDown(anchor);
    const layer = document.createElement("div");
    layer.className = "mantine-Combobox-dropdown mantine-Popover-dropdown";
    document.body.appendChild(layer);
    fireEvent.mouseDown(layer);
    expect(onClose).not.toHaveBeenCalled();

    fireEvent.mouseDown(document.body);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("renders nothing without an anchor", () => {
    render(
      <MantineProvider>
        <AnchoredPopover anchor={null} onClose={() => undefined}>
          <span>content</span>
        </AnchoredPopover>
      </MantineProvider>,
    );
    expect(screen.queryByText("content")).toBeNull();
  });
});

describe("escapeBelongsToLayer", () => {
  it("is true for expanded comboboxes and anything inside listboxes and menus", () => {
    const input = document.createElement("input");
    input.setAttribute("aria-expanded", "true");
    expect(escapeBelongsToLayer(input)).toBe(true);
    input.setAttribute("aria-expanded", "false");
    expect(escapeBelongsToLayer(input)).toBe(false);
    const menu = document.createElement("div");
    menu.setAttribute("role", "menu");
    const item = document.createElement("button");
    menu.appendChild(item);
    expect(escapeBelongsToLayer(item)).toBe(true);
    expect(escapeBelongsToLayer(null)).toBe(false);
  });
});
