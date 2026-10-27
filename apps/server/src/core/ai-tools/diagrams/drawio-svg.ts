import { load } from 'cheerio';
import { DiagramXmlError, graphModelOf, toMxfile } from './drawio-xml';

// A preview SVG for a draw.io graph model, carrying the model so draw.io
// opens it for editing (the "xmlsvg" format). The preview draws the common
// shapes, labels and straight edges; draw.io redraws it exactly on save.

const MAX_CELLS = 500;
const PADDING = 12;

type Box = { x: number; y: number; w: number; h: number };
type Vertex = Box & {
  id: string;
  label: string;
  style: Record<string, string>;
};
type Edge = {
  label: string;
  style: Record<string, string>;
  from?: { x: number; y: number };
  to?: { x: number; y: number };
  source?: string;
  target?: string;
};

function parseStyle(style = ''): Record<string, string> {
  const out: Record<string, string> = {};
  for (const part of style.split(';')) {
    if (!part) continue;
    const eq = part.indexOf('=');
    if (eq < 0) out[part] = '1';
    else out[part.slice(0, eq)] = part.slice(eq + 1);
  }
  return out;
}

function labelText(value = ''): string {
  return load(`<div>${value.replace(/<br\s*\/?>/gi, '\n')}</div>`)('div')
    .text()
    .trim();
}

const esc = (s: string) =>
  s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

const color = (value: string | undefined, fallback: string) =>
  value && /^(#[0-9a-f]{3,8}|[a-z]+)$/i.test(value) && value !== 'default'
    ? value
    : value === 'none'
      ? 'none'
      : fallback;

const num = (v: string | undefined, d = 0) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : d;
};

// where the line from the centre of a box towards a point leaves the box
function clip(box: Box, toward: { x: number; y: number }) {
  const cx = box.x + box.w / 2;
  const cy = box.y + box.h / 2;
  const dx = toward.x - cx;
  const dy = toward.y - cy;
  if (dx === 0 && dy === 0) return { x: cx, y: cy };
  const sx = dx === 0 ? Infinity : box.w / 2 / Math.abs(dx);
  const sy = dy === 0 ? Infinity : box.h / 2 / Math.abs(dy);
  const s = Math.min(sx, sy);
  return { x: cx + dx * s, y: cy + dy * s };
}

function textLines(label: string, x: number, y: number, style: Record<string, string>) {
  const lines = label.split('\n').slice(0, 12);
  const size = num(style.fontSize, 12);
  const top = y - ((lines.length - 1) * size * 1.2) / 2;
  const fill = color(style.fontColor, '#000000');
  return lines
    .map(
      (line, i) =>
        `<text x="${x}" y="${top + i * size * 1.2}" font-family="Helvetica, Arial, sans-serif" font-size="${size}" fill="${fill}" text-anchor="middle" dominant-baseline="central">${esc(line)}</text>`,
    )
    .join('');
}

function shapeOf(style: Record<string, string>): string {
  if ('ellipse' in style || style.shape === 'ellipse') return 'ellipse';
  if ('rhombus' in style || style.shape === 'rhombus') return 'rhombus';
  if ('text' in style) return 'text';
  return 'rect';
}

export function renderDrawioSvg(xml: string, title = 'diagram'): {
  svg: string;
  model: string;
} {
  const model = graphModelOf(xml);
  const $ = load(model, { xmlMode: true });
  const cells = $('mxCell').toArray();
  if (cells.length > MAX_CELLS) {
    throw new DiagramXmlError(`A diagram may have at most ${MAX_CELLS} cells`);
  }

  // absolute positions: a vertex inside a container is relative to it
  const raw = new Map<string, { parent?: string; box: Box }>();
  const vertices: Vertex[] = [];
  const edges: Edge[] = [];
  for (const el of cells) {
    const cell = $(el);
    const geo = cell.children('mxGeometry').first();
    const style = parseStyle(cell.attr('style'));
    if (cell.attr('vertex') === '1') {
      const box = {
        x: num(geo.attr('x')),
        y: num(geo.attr('y')),
        w: num(geo.attr('width'), 120),
        h: num(geo.attr('height'), 60),
      };
      raw.set(cell.attr('id'), { parent: cell.attr('parent'), box });
      vertices.push({
        id: cell.attr('id'),
        label: labelText(cell.attr('value')),
        style,
        ...box,
      });
    } else if (cell.attr('edge') === '1') {
      const point = (as: string) => {
        const p = geo.children(`mxPoint[as="${as}"]`).first();
        return p.length ? { x: num(p.attr('x')), y: num(p.attr('y')) } : undefined;
      };
      edges.push({
        label: labelText(cell.attr('value')),
        style,
        source: cell.attr('source'),
        target: cell.attr('target'),
        from: point('sourcePoint'),
        to: point('targetPoint'),
      });
    }
  }
  const absolute = (id: string, depth = 0): Box | undefined => {
    const entry = raw.get(id);
    if (!entry) return undefined;
    const parent = entry.parent && depth < 20 ? absolute(entry.parent, depth + 1) : undefined;
    return parent
      ? { ...entry.box, x: entry.box.x + parent.x, y: entry.box.y + parent.y }
      : entry.box;
  };
  for (const v of vertices) Object.assign(v, absolute(v.id));
  const byId = new Map(vertices.map((v) => [v.id, v]));

  const parts: string[] = [];
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  const grow = (x: number, y: number) => {
    minX = Math.min(minX, x);
    minY = Math.min(minY, y);
    maxX = Math.max(maxX, x);
    maxY = Math.max(maxY, y);
  };

  for (const v of vertices) {
    grow(v.x, v.y);
    grow(v.x + v.w, v.y + v.h);
    const fill = color(v.style.fillColor, '#ffffff');
    const stroke = color(v.style.strokeColor, '#000000');
    const dash = v.style.dashed === '1' ? ' stroke-dasharray="6 4"' : '';
    const shape = shapeOf(v.style);
    if (shape === 'ellipse') {
      parts.push(
        `<ellipse cx="${v.x + v.w / 2}" cy="${v.y + v.h / 2}" rx="${v.w / 2}" ry="${v.h / 2}" fill="${fill}" stroke="${stroke}"${dash}/>`,
      );
    } else if (shape === 'rhombus') {
      const cx = v.x + v.w / 2;
      const cy = v.y + v.h / 2;
      parts.push(
        `<polygon points="${cx},${v.y} ${v.x + v.w},${cy} ${cx},${v.y + v.h} ${v.x},${cy}" fill="${fill}" stroke="${stroke}"${dash}/>`,
      );
    } else if (shape === 'rect') {
      const r = v.style.rounded === '1' ? Math.min(10, v.h / 4) : 0;
      parts.push(
        `<rect x="${v.x}" y="${v.y}" width="${v.w}" height="${v.h}" rx="${r}" fill="${fill}" stroke="${stroke}"${dash}/>`,
      );
    }
    if (v.label) {
      parts.push(textLines(v.label, v.x + v.w / 2, v.y + v.h / 2, v.style));
    }
  }

  for (const e of edges) {
    const s = e.source ? byId.get(e.source) : undefined;
    const t = e.target ? byId.get(e.target) : undefined;
    const centre = (b: Box) => ({ x: b.x + b.w / 2, y: b.y + b.h / 2 });
    let from = s ? centre(s) : e.from;
    let to = t ? centre(t) : e.to;
    if (!from || !to) continue;
    if (s) from = clip(s, to);
    if (t) to = clip(t, from);
    grow(from.x, from.y);
    grow(to.x, to.y);
    const stroke = color(e.style.strokeColor, '#000000');
    const dash = e.style.dashed === '1' ? ' stroke-dasharray="6 4"' : '';
    const arrow = e.style.endArrow === 'none' ? '' : ' marker-end="url(#arrow)"';
    parts.push(
      `<line x1="${from.x}" y1="${from.y}" x2="${to.x}" y2="${to.y}" stroke="${stroke}"${dash}${arrow}/>`,
    );
    if (e.label) {
      parts.push(
        textLines(e.label, (from.x + to.x) / 2, (from.y + to.y) / 2 - 8, e.style),
      );
    }
  }

  if (!Number.isFinite(minX)) {
    minX = 0;
    minY = 0;
    maxX = 120;
    maxY = 60;
  }
  const x = minX - PADDING;
  const y = minY - PADDING;
  const w = Math.ceil(maxX - minX + PADDING * 2);
  const h = Math.ceil(maxY - minY + PADDING * 2);
  const mxfile = toMxfile(model, title);

  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" version="1.1" width="${w}px" height="${h}px" viewBox="${x} ${y} ${w} ${h}" content="${esc(mxfile)}">` +
    `<defs><marker id="arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="8" markerHeight="8" orient="auto-start-reverse"><path d="M 0 0 L 10 5 L 0 10 z" fill="context-stroke"/></marker></defs>` +
    `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="#ffffff"/>` +
    parts.join('') +
    `</svg>`;
  return { svg, model };
}
