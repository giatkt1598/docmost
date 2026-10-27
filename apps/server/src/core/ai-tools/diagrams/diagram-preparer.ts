import { Injectable } from '@nestjs/common';
import { Page, User } from '@docmost/db/types/entity.types';
import { AttachmentWriter } from '../attachment-writer';
import { BlockInput } from '../blocks/doc-blocks';
import { Operation } from '../operations/engine';
import { InputShapeError } from '../operations/normalize';
import { renderDrawioSvg } from './drawio-svg';
import { DiagramXmlError } from './drawio-xml';
import { MermaidValidator } from './mermaid-validator';

// Before an edit: draw.io XML in the operations becomes an SVG file of the
// page (preview + the diagram inside, as draw.io saves it). The blocks then
// point at that file by attachment_id.
@Injectable()
export class DiagramPreparer {
  constructor(
    private readonly writer: AttachmentWriter,
    private readonly mermaid: MermaidValidator,
  ) {}

  async prepare(
    operations: Operation[],
    page: Page,
    user: User,
  ): Promise<Operation[]> {
    const save = async (xml: string, title: string | undefined, where: string) => {
      let svg: string;
      try {
        svg = renderDrawioSvg(xml, title || 'diagram').svg;
      } catch (err) {
        if (err instanceof DiagramXmlError) {
          throw new InputShapeError(err.message, where);
        }
        throw err;
      }
      const ref = await this.writer.save({
        buffer: Buffer.from(svg, 'utf8'),
        fileName: 'diagram.drawio.svg',
        mimeType: 'image/svg+xml',
        page,
        userId: user.id,
      });
      return ref.id;
    };

    // a syntax error comes back to the model before anything is written
    const checkMermaid = async (source: string | undefined, where: string) => {
      if (!source?.trim()) return;
      const result = await this.mermaid.check(source);
      if (result.ok === false) {
        throw new InputShapeError(
          `Mermaid syntax error: ${MermaidValidator.describe(result.error)}`,
          where,
        );
      }
    };

    const block = async (input: BlockInput, where: string): Promise<BlockInput> => {
      let out = input;
      if (input.type === 'mermaid') {
        await checkMermaid(input.source ?? input.text, where);
      }
      if (input.type === 'drawio' && input.xml) {
        const { xml, ...rest } = input;
        out = { ...rest, attachment_id: await save(xml, input.title, where) };
      }
      if (out.children) {
        out = {
          ...out,
          children: await Promise.all(
            out.children.map((c, i) => block(c, `${where}.children.${i}`)),
          ),
        };
      }
      return out;
    };

    const result: Operation[] = [];
    for (const [i, op] of operations.entries()) {
      if (op.op === 'insert') {
        result.push({
          ...op,
          blocks: await Promise.all(
            op.blocks.map((b, j) => block(b, `operations.${i}.blocks.${j}`)),
          ),
        });
      } else if (op.op === 'update' && op.patch?.source) {
        await checkMermaid(op.patch.source, `operations.${i}.patch`);
        result.push(op);
      } else if (op.op === 'update' && op.patch?.xml) {
        const { xml, ...patch } = op.patch;
        result.push({
          ...op,
          patch: {
            ...patch,
            attachment_id: await save(xml, patch.title, `operations.${i}.patch`),
          },
        });
      } else {
        result.push(op);
      }
    }
    return result;
  }
}
