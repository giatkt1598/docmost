// Inline content of a block as rich-text spans, and back.
//
// Spans cover the formatting the AI tools understand (bold, italic,
// underline, strike, code, link). Anything else rides along untouched:
// other marks (comments, highlights, colours) in `extra_marks`, inline
// nodes the tools do not model (mentions, math, status, footnote refs) as
// `inline`. Echoing a span back keeps them; leaving it out removes them.

export type PmMark = { type: string; attrs?: Record<string, any> };
export type PmNode = {
  type: string;
  attrs?: Record<string, any>;
  content?: PmNode[];
  marks?: PmMark[];
  text?: string;
};

export type TextSpan = {
  text: string;
  bold?: true;
  italic?: true;
  underline?: true;
  strike?: true;
  code?: true;
  link?: string;
  extra_marks?: PmMark[];
};
export type BreakSpan = { hard_break: true };
export type InlineSpan = { inline: PmNode; preview: string };
// inline formula (LaTeX)
export type MathSpan = { math: string };
// coloured status label
export type StatusSpan = { status: { text: string; color?: string } };
export type Span = TextSpan | BreakSpan | InlineSpan | MathSpan | StatusSpan;

export const STATUS_COLORS = [
  'gray',
  'blue',
  'green',
  'yellow',
  'red',
] as const;

const FLAG_MARKS = ['bold', 'italic', 'underline', 'strike', 'code'] as const;

// Protocols a link may use; anything else (javascript:, data:) is refused.
const SAFE_LINK = /^(https?:\/\/|mailto:|\/(?!\/)|#)/i;

export function isSafeLink(href: string): boolean {
  return SAFE_LINK.test(href.trim());
}

function inlinePreview(node: PmNode): string {
  const a = node.attrs ?? {};
  switch (node.type) {
    case 'mention':
      return `@${a.label ?? ''}`;
    case 'mathInline':
      return `$${a.text ?? ''}$`;
    case 'status':
      return `[${a.text ?? ''}]`;
    default:
      return (
        node.content?.map((c) => c.text ?? '').join('') || `[${node.type}]`
      );
  }
}

export function spansFromInline(content: PmNode[] = []): Span[] {
  const spans: Span[] = [];
  for (const node of content) {
    if (node.type === 'text') {
      const span: TextSpan = { text: node.text ?? '' };
      const extra: PmMark[] = [];
      for (const mark of node.marks ?? []) {
        if ((FLAG_MARKS as readonly string[]).includes(mark.type)) {
          (span as any)[mark.type] = true;
        } else if (mark.type === 'link' && mark.attrs?.href) {
          span.link = mark.attrs.href;
        } else {
          extra.push(mark);
        }
      }
      if (extra.length) span.extra_marks = extra;
      spans.push(span);
    } else if (node.type === 'hardBreak') {
      spans.push({ hard_break: true });
    } else if (node.type === 'mathInline') {
      spans.push({ math: node.attrs?.text ?? '' });
    } else if (node.type === 'status') {
      spans.push({
        status: {
          text: node.attrs?.text ?? '',
          color: node.attrs?.color ?? 'gray',
        },
      });
    } else {
      spans.push({ inline: node, preview: inlinePreview(node) });
    }
  }
  return spans;
}

export function inlineFromSpans(spans: Span[] = []): PmNode[] {
  const nodes: PmNode[] = [];
  for (const span of spans) {
    if ('hard_break' in span) {
      nodes.push({ type: 'hardBreak' });
    } else if ('math' in span) {
      if (span.math)
        nodes.push({ type: 'mathInline', attrs: { text: span.math } });
    } else if ('status' in span) {
      const color = (STATUS_COLORS as readonly string[]).includes(
        span.status?.color ?? '',
      )
        ? span.status.color
        : 'gray';
      if (span.status?.text) {
        nodes.push({
          type: 'status',
          attrs: { text: span.status.text, color },
        });
      }
    } else if ('inline' in span) {
      nodes.push(span.inline);
    } else {
      if (!span.text) continue; // ProseMirror forbids empty text nodes
      const marks: PmMark[] = [];
      for (const flag of FLAG_MARKS) {
        if (span[flag]) marks.push({ type: flag });
      }
      if (span.link) marks.push({ type: 'link', attrs: { href: span.link } });
      marks.push(...(span.extra_marks ?? []));
      nodes.push({
        type: 'text',
        text: span.text,
        ...(marks.length && { marks }),
      });
    }
  }
  return nodes;
}

export function plainText(spans: Span[] = []): string {
  return spans
    .map((s) =>
      'hard_break' in s
        ? '\n'
        : 'inline' in s
          ? s.preview
          : 'math' in s
            ? `$${s.math}$`
            : 'status' in s
              ? `[${s.status.text}]`
              : s.text,
    )
    .join('');
}
