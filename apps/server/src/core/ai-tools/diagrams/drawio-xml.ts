import { load } from 'cheerio';
import { inflateRawSync } from 'node:zlib';

// draw.io keeps a diagram as an <mxfile> of <diagram>s, each holding an
// <mxGraphModel> either as XML or compressed (deflate-raw + base64 of the
// URI-encoded XML). Saved files are SVGs that carry the mxfile in the
// `content` attribute of their root. Pure functions.

export class DiagramXmlError extends Error {}

export const MAX_DIAGRAM_XML = 500_000;

export function decompressDiagram(text: string): string {
  const bytes = Buffer.from(text.trim(), 'base64');
  const inflated = inflateRawSync(bytes).toString('utf8');
  return decodeURIComponent(inflated);
}

// The graph model of the first page of an mxfile or of a bare model.
export function graphModelOf(xml: string): string {
  const source = xml.trim();
  if (!source) throw new DiagramXmlError('The diagram XML is empty');
  if (source.length > MAX_DIAGRAM_XML) {
    throw new DiagramXmlError('The diagram XML is too large');
  }
  const $ = load(source, { xmlMode: true });
  const model = $('mxGraphModel').first();
  if (model.length) return $.xml(model);
  const diagram = $('mxfile > diagram').first();
  if (diagram.length) {
    const inner = diagram.text().trim();
    if (!inner) throw new DiagramXmlError('The diagram page is empty');
    try {
      return graphModelOf(decompressDiagram(inner));
    } catch {
      throw new DiagramXmlError('The diagram page could not be decoded');
    }
  }
  throw new DiagramXmlError(
    'Expected draw.io XML: an <mxGraphModel> or an <mxfile> with a <diagram>',
  );
}

// An mxfile holding one uncompressed page with the given model.
export function toMxfile(model: string, name = 'Page-1'): string {
  const safeName = name.replace(/[<>&"]/g, '');
  return `<mxfile host="Docmost"><diagram id="docmost-ai" name="${safeName}">${model}</diagram></mxfile>`;
}

// The diagram XML stored in a draw.io SVG file.
export function xmlFromDrawioSvg(svg: string): string {
  const $ = load(svg, { xmlMode: true });
  const content = $('svg').first().attr('content');
  if (!content) {
    throw new DiagramXmlError('This file has no draw.io diagram inside');
  }
  return graphModelOf(content);
}
