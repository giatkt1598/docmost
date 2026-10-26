import { BadRequestException } from '@nestjs/common';
import { DocxImportService } from './docx-import.service';
import { PdfImportService } from './pdf-import.service';

// a one-page PDF with a line of text per entry
function makePdf(lines: string[]): Buffer {
  const content = lines
    .map((line, i) => `BT /F1 18 Tf 20 ${160 - i * 30} Td (${line}) Tj ET`)
    .join('\n');
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 400 200] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>',
    `<< /Length ${content.length} >>\nstream\n${content}\nendstream`,
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
  ];
  let out = '%PDF-1.4\n';
  const offsets: number[] = [];
  objects.forEach((body, i) => {
    offsets.push(out.length);
    out += `${i + 1} 0 obj\n${body}\nendobj\n`;
  });
  const xref = out.length;
  out += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  out += offsets
    .map((o) => `${String(o).padStart(10, '0')} 00000 n \n`)
    .join('');
  out += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
  return Buffer.from(out);
}

async function makeDocx(bodyXml: string): Promise<Buffer> {
  // jszip is a dependency of mammoth
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const JSZip = require(
    require.resolve('jszip', { paths: [require.resolve('mammoth')] }),
  );
  const zip = new JSZip();
  zip.file(
    '[Content_Types].xml',
    `<?xml version="1.0" encoding="UTF-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>`,
  );
  zip.file(
    '_rels/.rels',
    `<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>`,
  );
  zip.file(
    'word/document.xml',
    `<?xml version="1.0" encoding="UTF-8"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>${bodyXml}</w:body></w:document>`,
  );
  return zip.generateAsync({ type: 'nodebuffer' });
}

const images = { saveImage: jest.fn().mockResolvedValue(null) } as any;

describe('DocxImportService', () => {
  const service = new DocxImportService(images);

  it('converts headings, formatting and tables', async () => {
    const docx = await makeDocx(
      `<w:p><w:pPr><w:pStyle w:val="Heading1"/></w:pPr><w:r><w:t>Tiêu đề</w:t></w:r></w:p>` +
        `<w:p><w:r><w:rPr><w:b/></w:rPr><w:t>đậm</w:t></w:r><w:r><w:t xml:space="preserve"> thường</w:t></w:r></w:p>` +
        `<w:tbl><w:tr><w:tc><w:p><w:r><w:t>A</w:t></w:r></w:p></w:tc><w:tc><w:p><w:r><w:t>B</w:t></w:r></w:p></w:tc></w:tr></w:tbl>`,
    );
    const html = await service.convertDocxToHtml(docx, 'w', 's', 'p', 'u');
    expect(html).toContain('<h1>Tiêu đề</h1>');
    expect(html).toContain('<strong>đậm</strong>');
    expect(html).toContain('<td><p>A</p></td>');
  });

  it('refuses a file that is not a Word document', async () => {
    await expect(
      service.convertDocxToHtml(Buffer.from('nope'), 'w', 's', 'p', 'u'),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('refuses a document without content', async () => {
    const docx = await makeDocx('');
    await expect(
      service.convertDocxToHtml(docx, 'w', 's', 'p', 'u'),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});

describe('PdfImportService', () => {
  const service = new PdfImportService(images);

  it('extracts the text layer', async () => {
    const html = await service.convertPdfToHtml(
      makePdf(['Hello wiki', 'Second line']),
      'w',
      's',
      'p',
      'u',
    );
    expect(html).toContain('Hello wiki');
    expect(html).toContain('Second line');
  });

  it('refuses a file that is not a PDF', async () => {
    await expect(
      service.convertPdfToHtml(Buffer.from('nope'), 'w', 's', 'p', 'u'),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});

describe('ImportImageService', () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { ImportImageService, imageHtml } = require('./import-image.service');
  const base = { workspaceId: 'w', spaceId: 's', pageId: 'p', userId: 'u' };
  const png1x1 = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==',
    'base64',
  );

  it('skips formats the editor cannot show and decorative slivers', async () => {
    const db = { insertInto: jest.fn() };
    const service = new ImportImageService(db as any, {} as any);
    expect(
      await service.saveImage({
        ...base,
        buffer: png1x1,
        contentType: 'image/x-emf',
      }),
    ).toBeNull();
    expect(
      await service.saveImage({
        ...base,
        buffer: png1x1,
        contentType: 'image/png',
      }),
    ).toBeNull();
    expect(db.insertInto).not.toHaveBeenCalled();
  });

  it('renders an editor image', () => {
    expect(
      imageHtml({
        attachmentId: 'a1',
        src: '/api/files/a1/image.png',
        width: 300,
        height: 200,
      }),
    ).toBe(
      '<img src="/api/files/a1/image.png" data-attachment-id="a1" width="300" height="200" data-align="center">',
    );
  });
});
