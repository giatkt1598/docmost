import { ReactNode, Ref, useEffect, useLayoutEffect, useRef } from "react";
import { Popover, PopoverProps } from "@mantine/core";

// z-index of option popovers, and of everything that opens inside them
// (select lists, autocomplete suggestions, menus, nested popovers). Mantine's
// default is 300 for all of them, which lets a dropdown end up behind the
// popover that holds it.
export const OPTIONS_POPOVER_Z = 400;
export const NESTED_LAYER_Z = OPTIONS_POPOVER_Z + 100;

// For every Select / MultiSelect / Autocomplete inside an option popover:
// rendered in a portal (never clipped) above the popover.
export const NESTED_COMBOBOX_PROPS = {
  withinPortal: true,
  zIndex: NESTED_LAYER_Z,
} as const;

// Mantine-rendered floating layers; a click inside one is never "outside".
const LAYER_SELECTOR =
  '[class*="mantine-Popover-dropdown"], [class*="mantine-Menu-dropdown"], [class*="mantine-Combobox-dropdown"]';

// An existing element used as the popover's reference. Popover.Target hands a
// ref to its child; this child passes the external element through instead
// of rendering anything, so the popover is positioned (and kept positioned
// while ancestors scroll) against that element.
function ExternalAnchor({ element, ref }: { element: HTMLElement | null; ref?: Ref<HTMLElement> }) {
  useLayoutEffect(() => {
    if (!ref) return;
    const assign = (value: HTMLElement | null) => {
      if (typeof ref === "function") ref(value);
      else (ref as { current: HTMLElement | null }).current = value;
    };
    assign(element);
    return () => assign(null);
  }, [element, ref]);
  return null;
}

// Escape must close an open list / menu first, and only then the popover.
// Mantine's lists close on Escape themselves; here we only decide whether
// the same key press should also close the popover (no, if it comes from an
// open list or menu).
export function escapeBelongsToLayer(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null;
  if (!el || typeof el.closest !== "function") return false;
  return (
    el.getAttribute("aria-expanded") === "true" ||
    !!el.closest('[role="listbox"], [role="menu"]')
  );
}

type Props = {
  anchor: HTMLElement | null;
  onClose: () => void;
  children: ReactNode;
  position?: PopoverProps["position"];
};

// Popover opened next to an element that is already on the page (a column
// header, a toolbar button). Closes on Escape and on outside clicks.
export function AnchoredPopover({ anchor, onClose, children, position = "bottom-start" }: Props) {
  const dropdownRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;

  // outside clicks, tolerant of the lists and menus portaled out of the
  // dropdown (Mantine would count those as outside)
  useEffect(() => {
    const onDown = (e: MouseEvent | TouchEvent) => {
      const target = e.target as Node | null;
      if (!target) return;
      if (dropdownRef.current?.contains(target)) return;
      if (anchor?.contains(target)) return;
      if ((target as HTMLElement).closest?.(LAYER_SELECTOR)) return;
      closeRef.current();
    };
    // Capture phase: runs before React updates the DOM, so a list that
    // this very Escape closes still reads as open (aria-expanded) here.
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape" || e.defaultPrevented) return;
      if (escapeBelongsToLayer(e.target)) return;
      closeRef.current();
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("touchstart", onDown);
    document.addEventListener("keydown", onKey, true);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("touchstart", onDown);
      document.removeEventListener("keydown", onKey, true);
    };
  }, [anchor]);

  if (!anchor) return null;
  return (
    <Popover
      opened
      position={position}
      withinPortal
      zIndex={OPTIONS_POPOVER_Z}
      shadow="md"
      offset={4}
      closeOnClickOutside={false}
      closeOnEscape={false}
      trapFocus={false}
      middlewares={{ flip: true, shift: { padding: 8 }, size: false }}
    >
      <Popover.Target>
        <ExternalAnchor element={anchor} />
      </Popover.Target>
      <Popover.Dropdown ref={dropdownRef} p="sm">
        {children}
      </Popover.Dropdown>
    </Popover>
  );
}
