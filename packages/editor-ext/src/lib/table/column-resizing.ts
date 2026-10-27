import type { Node as ProseMirrorNode } from "@tiptap/pm/model";
import { Plugin, type EditorState } from "@tiptap/pm/state";
import {
  Decoration,
  DecorationSet,
  type EditorView,
  type NodeView,
} from "@tiptap/pm/view";
import {
  TableMap,
  cellAround,
  columnResizingPluginKey,
  tableNodeTypes,
} from "@tiptap/pm/tables";
import { TableView, updateColumns } from "./table-view";
import {
  resizeAdjacentColumns,
  scaleColumns,
  stripWidthFromStyle,
  type TableEdge,
} from "./utils/column-resize";

/**
 * Fork of prosemirror-tables' `columnResizing` with two behaviours:
 * - dragging the table's outer (left/right) edge scales every column;
 * - dragging a boundary between columns resizes only the two neighbours.
 *
 * It shares `columnResizingPluginKey` with the original so code reading
 * `activeHandle` / `dragging` (chevron, dnd) keeps working.
 */

export interface ColumnResizingOptions {
  handleWidth?: number;
  cellMinWidth?: number;
  View?: new (node: ProseMirrorNode, cellMinWidth: number, view: EditorView) => NodeView;
}

interface Dragging {
  startX: number;
  startWidths: number[];
  col: number;
  edge: TableEdge | null;
}

export class ResizeState {
  constructor(
    public activeHandle: number,
    public dragging: Dragging | false | null,
    public edge: TableEdge | null = null,
  ) {}

  apply(tr: any): ResizeState {
    const action = tr.getMeta(columnResizingPluginKey);
    if (action && action.setHandle != null) {
      return new ResizeState(action.setHandle, false, action.edge ?? null);
    }
    if (action && action.setDragging !== undefined) {
      return new ResizeState(this.activeHandle, action.setDragging, this.edge);
    }
    if (this.activeHandle > -1 && tr.docChanged) {
      let handle = tr.mapping.map(this.activeHandle, -1);
      if (!pointsAtCell(tr.doc.resolve(handle))) handle = -1;
      return new ResizeState(handle, this.dragging, this.edge);
    }
    return this;
  }
}

function getResizeState(state: EditorState): ResizeState | undefined {
  return columnResizingPluginKey.getState(state) as unknown as
    | ResizeState
    | undefined;
}

export function columnResizing({
  handleWidth = 5,
  cellMinWidth = 49,
  View = TableView,
}: ColumnResizingOptions = {}): Plugin {
  const plugin: Plugin = new Plugin({
    key: columnResizingPluginKey,
    state: {
      init(_, state) {
        const nodeViews = (plugin.spec as any)?.props?.nodeViews;
        const tableName = tableNodeTypes(state.schema).table.name;
        if (View && nodeViews) {
          nodeViews[tableName] = (node: ProseMirrorNode, view: EditorView) =>
            new View(node, cellMinWidth, view);
        }
        return new ResizeState(-1, false);
      },
      apply(tr, prev: ResizeState) {
        return prev.apply(tr);
      },
    },
    props: {
      attributes: (state) => {
        const pluginState = getResizeState(state);
        return pluginState && pluginState.activeHandle > -1
          ? { class: "resize-cursor" }
          : {};
      },
      handleDOMEvents: {
        mousemove: (view, event) => {
          handleMouseMove(view, event as MouseEvent, handleWidth);
        },
        mouseleave: (view) => {
          handleMouseLeave(view);
        },
        mousedown: (view, event) =>
          handleMouseDown(view, event as MouseEvent, cellMinWidth),
      },
      decorations: (state) => {
        const pluginState = getResizeState(state);
        if (pluginState && pluginState.activeHandle > -1) {
          return handleDecorations(state, pluginState);
        }
        return undefined;
      },
      nodeViews: {},
    },
  });
  return plugin;
}

function pointsAtCell($pos: any): boolean {
  return $pos.parent.type.spec.tableRole === "row" && !!$pos.nodeAfter;
}

function domCellAround(target: any): HTMLElement | null {
  while (target && target.nodeName !== "TD" && target.nodeName !== "TH") {
    target =
      target.classList && target.classList.contains("ProseMirror")
        ? null
        : target.parentNode;
  }
  return target;
}

/** Logical index of the last column the cell at `handle` covers. */
function handleColumn(state: EditorState, handle: number) {
  const $cell = state.doc.resolve(handle);
  const table = $cell.node(-1);
  const map = TableMap.get(table);
  const start = $cell.start(-1);
  const first = map.colCount($cell.pos - start);
  const colspan = $cell.nodeAfter!.attrs.colspan as number;
  return { table, map, start, first, last: first + colspan - 1 };
}

interface Hit {
  cell: number;
  edge: TableEdge | null;
}

const NO_HIT: Hit = { cell: -1, edge: null };

function edgeCell(
  view: EditorView,
  event: MouseEvent,
  side: "left" | "right",
  handleWidth: number,
): Hit {
  const offset = side === "right" ? -handleWidth : handleWidth;
  const found = view.posAtCoords({
    left: event.clientX + offset,
    top: event.clientY,
  });
  if (!found) return NO_HIT;

  const $cell = cellAround(view.state.doc.resolve(found.pos));
  if (!$cell) return NO_HIT;

  const map = TableMap.get($cell.node(-1));
  const start = $cell.start(-1);

  if (side === "right") {
    const last =
      map.colCount($cell.pos - start) + $cell.nodeAfter!.attrs.colspan - 1;
    return { cell: $cell.pos, edge: last === map.width - 1 ? "right" : null };
  }

  const index = map.map.indexOf($cell.pos - start);
  if (index % map.width === 0) return { cell: $cell.pos, edge: "left" };
  return { cell: start + map.map[index - 1], edge: null };
}

function handleMouseMove(
  view: EditorView,
  event: MouseEvent,
  handleWidth: number,
) {
  if (!view.editable) return;
  const pluginState = getResizeState(view.state);
  if (!pluginState || pluginState.dragging) return;

  let hit = NO_HIT;
  const target = domCellAround(event.target);
  if (target) {
    const { left, right } = target.getBoundingClientRect();
    if (event.clientX - left <= handleWidth) {
      hit = edgeCell(view, event, "left", handleWidth);
    } else if (right - event.clientX <= handleWidth) {
      hit = edgeCell(view, event, "right", handleWidth);
    }
  }

  if (hit.cell !== pluginState.activeHandle || hit.edge !== pluginState.edge) {
    view.dispatch(
      view.state.tr.setMeta(columnResizingPluginKey, {
        setHandle: hit.cell,
        edge: hit.edge,
      }),
    );
  }
}

function handleMouseLeave(view: EditorView) {
  if (!view.editable) return;
  const pluginState = getResizeState(view.state);
  if (pluginState && pluginState.activeHandle > -1 && !pluginState.dragging) {
    view.dispatch(
      view.state.tr.setMeta(columnResizingPluginKey, { setHandle: -1 }),
    );
  }
}

function findTableDom(view: EditorView, tableStart: number): HTMLElement | null {
  let dom: any = view.domAtPos(tableStart).node;
  while (dom && dom.nodeName !== "TABLE") dom = dom.parentNode;
  return dom;
}

/** Rendered width of every logical column, preferring stored `colwidth`. */
function measureColumns(
  view: EditorView,
  table: ProseMirrorNode,
  map: TableMap,
  start: number,
): number[] {
  const widths: number[] = [];
  for (let col = 0; col < map.width; col++) {
    let width = 0;
    for (let row = 0; row < map.height && !width; row++) {
      const index = row * map.width + col;
      const pos = map.map[index];
      if (row && pos === map.map[index - map.width]) continue;
      const cell = table.nodeAt(pos)!;
      const colspan = cell.attrs.colspan as number;
      const sub = colspan === 1 ? 0 : col - map.colCount(pos);
      const stored = cell.attrs.colwidth?.[sub];
      if (stored) {
        width = stored;
      } else if (colspan === 1) {
        const dom = view.nodeDOM(start + pos) as HTMLElement | null;
        width = dom?.offsetWidth ?? 0;
      }
    }
    widths.push(width);
  }

  // Columns covered only by merged cells: spread the leftover evenly.
  const missing = widths.filter((w) => !w).length;
  if (missing) {
    const dom = findTableDom(view, start);
    const total = dom ? dom.offsetWidth : 0;
    const known = widths.reduce((sum, w) => sum + w, 0);
    const share = Math.max(total - known, 0) / missing || 1;
    return widths.map((w) => w || Math.round(share));
  }
  return widths;
}

function targetWidths(drag: Dragging, event: MouseEvent, min: number) {
  const dx = event.clientX - drag.startX;
  if (drag.edge) {
    return scaleColumns(drag.startWidths, drag.edge === "left" ? -dx : dx, min);
  }
  return resizeAdjacentColumns(drag.startWidths, drag.col, dx, min);
}

function handleMouseDown(
  view: EditorView,
  event: MouseEvent,
  cellMinWidth: number,
): boolean {
  if (!view.editable) return false;
  const win = view.dom.ownerDocument.defaultView ?? window;
  const pluginState = getResizeState(view.state);
  if (!pluginState || pluginState.activeHandle === -1 || pluginState.dragging) {
    return false;
  }

  const { table, map, start, first, last } = handleColumn(
    view.state,
    pluginState.activeHandle,
  );
  const edge: TableEdge | null = pluginState.edge;
  const col = edge === "left" ? first : last;
  const startWidths = measureColumns(view, table, map, start);

  view.dispatch(
    view.state.tr.setMeta(columnResizingPluginKey, {
      setDragging: { startX: event.clientX, startWidths, col, edge },
    }),
  );

  const preview = (widths: number[]) => {
    const dom = findTableDom(view, start);
    if (!dom) return;
    updateColumns(
      table,
      dom.firstChild as HTMLElement,
      dom as HTMLTableElement,
      cellMinWidth,
      new Map(widths.map((w, i) => [i, w])),
    );
    // user-set widths would otherwise keep the table from shrinking
    dom.style.width = `${widths.reduce((sum, w) => sum + w, 0)}px`;
    dom.style.minWidth = "";
  };

  function finish(e: MouseEvent) {
    win.removeEventListener("mouseup", finish);
    win.removeEventListener("mousemove", move);
    const current = getResizeState(view.state);
    if (current?.dragging) {
      commitWidths(view, current.activeHandle, targetWidths(current.dragging, e, cellMinWidth), !!current.dragging.edge);
      view.dispatch(
        view.state.tr.setMeta(columnResizingPluginKey, { setDragging: null }),
      );
    }
  }

  function move(e: MouseEvent) {
    if (!e.which) return finish(e);
    const current = getResizeState(view.state);
    if (current?.dragging) {
      preview(targetWidths(current.dragging, e, cellMinWidth));
    }
  }

  preview(startWidths);
  win.addEventListener("mouseup", finish);
  win.addEventListener("mousemove", move);
  event.preventDefault();
  return true;
}

function commitWidths(
  view: EditorView,
  handle: number,
  widths: number[],
  stripStyle: boolean,
) {
  const { table, map, start } = handleColumn(view.state, handle);
  const tr = view.state.tr;

  for (let col = 0; col < map.width; col++) {
    for (let row = 0; row < map.height; row++) {
      const index = row * map.width + col;
      if (row && map.map[index] === map.map[index - map.width]) continue;
      const pos = map.map[index];
      const attrs = table.nodeAt(pos)!.attrs;
      const sub = attrs.colspan === 1 ? 0 : col - map.colCount(pos);
      if (attrs.colwidth && attrs.colwidth[sub] === widths[col]) continue;

      const colwidth: number[] = attrs.colwidth
        ? attrs.colwidth.slice()
        : Array(attrs.colspan).fill(0);
      colwidth[sub] = widths[col];
      tr.setNodeMarkup(start + pos, null, { ...attrs, colwidth });
    }
  }

  const style = table.attrs.style;
  if (stripStyle && typeof style === "string" && /\bwidth\s*:/i.test(style)) {
    tr.setNodeMarkup(start - 1, null, {
      ...table.attrs,
      style: stripWidthFromStyle(style) || null,
    });
  }

  if (tr.docChanged) view.dispatch(tr);
}

function handleDecorations(state: EditorState, pluginState: ResizeState) {
  const decorations: Decoration[] = [];
  const { table, map, start, first, last } = handleColumn(
    state,
    pluginState.activeHandle,
  );
  const isLeft = pluginState.edge === "left";
  const col = isLeft ? first : last;

  for (let row = 0; row < map.height; row++) {
    const index = col + row * map.width;
    const startsHere = isLeft
      ? row === 0 || map.map[index] !== map.map[index - map.width]
      : (col === map.width - 1 || map.map[index] !== map.map[index + 1]) &&
        (row === 0 || map.map[index] !== map.map[index - map.width]);
    if (!startsHere) continue;

    const cellPos = map.map[index];
    const cell = table.nodeAt(cellPos)!;
    const dom = document.createElement("div");
    dom.className = isLeft
      ? "column-resize-handle column-resize-handle-left"
      : "column-resize-handle";
    if (pluginState.dragging) {
      decorations.push(
        Decoration.node(start + cellPos, start + cellPos + cell.nodeSize, {
          class: "column-resize-dragging",
        }),
      );
    }
    decorations.push(
      Decoration.widget(start + cellPos + cell.nodeSize - 1, dom),
    );
  }
  return DecorationSet.create(state.doc, decorations);
}
