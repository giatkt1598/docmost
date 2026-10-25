// Keyboard model of the table: which cell is active and what a key does.

export type CellPos = { row: number; col: number };
export type GridBounds = { rows: number; cols: number };

export type GridKeyAction =
  | { kind: "move"; to: CellPos }
  | { kind: "edit"; initialInput?: string }
  | { kind: "clear" }
  | { kind: "escape" }
  | { kind: "none" };

const clamp = (n: number, max: number) => Math.max(0, Math.min(max - 1, n));

export function clampPos(pos: CellPos, b: GridBounds): CellPos | null {
  if (b.rows <= 0 || b.cols <= 0) return null;
  return { row: clamp(pos.row, b.rows), col: clamp(pos.col, b.cols) };
}

export type KeyInput = {
  key: string;
  shiftKey?: boolean;
  ctrlKey?: boolean;
  metaKey?: boolean;
  altKey?: boolean;
};

// A key that types a character (starts editing with it).
export function isPrintableKey(e: KeyInput): boolean {
  return e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey;
}

export function gridKeyAction(
  pos: CellPos,
  e: KeyInput,
  b: GridBounds,
): GridKeyAction {
  if (b.rows <= 0 || b.cols <= 0) return { kind: "none" };
  const jump = e.ctrlKey || e.metaKey;
  switch (e.key) {
    case "ArrowUp":
      return { kind: "move", to: { row: jump ? 0 : clamp(pos.row - 1, b.rows), col: pos.col } };
    case "ArrowDown":
      return {
        kind: "move",
        to: { row: jump ? b.rows - 1 : clamp(pos.row + 1, b.rows), col: pos.col },
      };
    case "ArrowLeft":
      return { kind: "move", to: { row: pos.row, col: jump ? 0 : clamp(pos.col - 1, b.cols) } };
    case "ArrowRight":
      return {
        kind: "move",
        to: { row: pos.row, col: jump ? b.cols - 1 : clamp(pos.col + 1, b.cols) },
      };
    case "Home":
      return { kind: "move", to: { row: jump ? 0 : pos.row, col: 0 } };
    case "End":
      return { kind: "move", to: { row: jump ? b.rows - 1 : pos.row, col: b.cols - 1 } };
    case "Tab": {
      // wraps to the next / previous row
      const flat = pos.row * b.cols + pos.col + (e.shiftKey ? -1 : 1);
      const max = b.rows * b.cols - 1;
      const next = Math.max(0, Math.min(max, flat));
      return { kind: "move", to: { row: Math.floor(next / b.cols), col: next % b.cols } };
    }
    case "Enter":
    case "F2":
      return { kind: "edit" };
    case "Delete":
    case "Backspace":
      return { kind: "clear" };
    case "Escape":
      return { kind: "escape" };
    default:
      if (isPrintableKey(e)) return { kind: "edit", initialInput: e.key };
      return { kind: "none" };
  }
}

// Where the active cell goes after committing an edit with Enter / Tab.
export function afterCommit(
  pos: CellPos,
  key: "Enter" | "Tab" | "ShiftTab",
  b: GridBounds,
): CellPos {
  if (key === "Enter") return { row: clamp(pos.row + 1, b.rows), col: pos.col };
  const action = gridKeyAction(pos, { key: "Tab", shiftKey: key === "ShiftTab" }, b);
  return action.kind === "move" ? action.to : pos;
}
