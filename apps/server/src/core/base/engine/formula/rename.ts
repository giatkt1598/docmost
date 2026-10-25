import { normalizePropertyName } from './compiler';
import { Token, tokenize } from './tokenizer';

function quote(name: string, q: '"' | "'"): string {
  const escaped = name
    .replace(/\\/g, '\\\\')
    .replace(q === '"' ? /"/g : /'/g, `\\${q}`);
  return `${q}${escaped}${q}`;
}

function matches(value: string, oldName: string) {
  return (
    value === oldName ||
    normalizePropertyName(value) === normalizePropertyName(oldName)
  );
}

type Span = { start: number; end: number; quote: '"' | "'" };

function spansFromTokens(tokens: Token[], oldName: string): Span[] {
  const spans: Span[] = [];
  for (let i = 0; i + 3 < tokens.length; i++) {
    const [p, open, str, close] = tokens.slice(i, i + 4);
    if (
      p.type === 'ident' &&
      p.text.toLowerCase() === 'prop' &&
      open.type === 'lparen' &&
      str.type === 'string' &&
      close.type === 'rparen' &&
      matches(str.value as string, oldName)
    ) {
      spans.push({
        start: str.start,
        end: str.end,
        quote: str.text[0] === "'" ? "'" : '"',
      });
    }
  }
  return spans;
}

// Used when the source does not tokenize (for instance a formula written
// for an older syntax): only the plain prop("...") pattern is recognised.
function spansFromPattern(source: string, oldName: string): Span[] {
  const spans: Span[] = [];
  const re = /\bprop\(\s*(["'])((?:\\.|(?!\1)[^\\])*)\1\s*\)/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(source))) {
    const q = m[1] as '"' | "'";
    const value = m[2].replace(/\\(.)/g, '$1');
    if (!matches(value, oldName)) continue;
    const start = m.index + m[0].indexOf(q);
    spans.push({ start, end: start + m[2].length + 2, quote: q });
  }
  return spans;
}

// Rewrites prop("Old") to prop("New") in a formula source. Everything else,
// including spacing and the quote style, is kept.
export function renamePropertyReferences(
  source: string,
  oldName: string,
  newName: string,
): string {
  if (typeof source !== 'string' || !source || oldName === newName) {
    return source;
  }
  let spans: Span[];
  try {
    spans = spansFromTokens(tokenize(source), oldName);
  } catch {
    spans = spansFromPattern(source, oldName);
  }
  let out = source;
  for (const s of [...spans].reverse()) {
    out = out.slice(0, s.start) + quote(newName, s.quote) + out.slice(s.end);
  }
  return out;
}
