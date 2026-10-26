import { promises as fs } from 'fs';
import * as os from 'os';
import * as path from 'path';
import { ConfluenceImportService } from './confluence-import.service';

const page = (title: string, crumbs: string[], body = '<p>x</p>') =>
  `<html><head><title>S : ${title}</title></head><body>` +
  `<ol id="breadcrumbs">${crumbs
    .map((href) => `<li><a href="${href}">c</a></li>`)
    .join('')}</ol>` +
  `<div id="main-content">${body}</div></body></html>`;

async function writeExport(files: Record<string, string>) {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'confluence-'));
  for (const [name, content] of Object.entries(files)) {
    const abs = path.join(dir, name);
    await fs.mkdir(path.dirname(abs), { recursive: true });
    await fs.writeFile(abs, content);
  }
  return dir;
}

describe('ConfluenceImportService.prepare', () => {
  const service = new ConfluenceImportService();

  it('builds the tree and sibling order from index.html', async () => {
    const dir = await writeExport({
      'index.html':
        '<ul><li><a href="Home_1.html">Home</a><ul><li><a href="B_3.html">B</a></li><li><a href="A_2.html">A</a></li></ul></li></ul>',
      'Home_1.html': page('Home', []),
      'A_2.html': page('A', ['Home_1.html']),
      'B_3.html': page('B', ['Home_1.html']),
      'attachments/1/9.html': '<p>not a page</p>',
    });
    try {
      const { pagesMap, order } = await service.prepare(dir);
      expect([...pagesMap.keys()].sort()).toEqual([
        'A_2.html',
        'B_3.html',
        'Home_1.html',
      ]);
      const home = pagesMap.get('Home_1.html');
      expect(home.parentPageId).toBeNull();
      expect(pagesMap.get('A_2.html').parentPageId).toBe(home.id);
      // B comes before A in Confluence, whatever their names say
      expect(order.get('B_3.html')).toBeLessThan(order.get('A_2.html'));
      expect(pagesMap.get('B_3.html').name).toBe('B');
    } finally {
      await fs.rm(dir, { recursive: true, force: true });
    }
  });

  it('places pages missing from the index below their breadcrumb parent', async () => {
    const dir = await writeExport({
      'index.html': '<ul><li><a href="Home_1.html">Home</a></li></ul>',
      'Home_1.html': page('Home', []),
      'Lost_2.html': page('Lost', ['index.html', 'Home_1.html', 'Lost_2.html']),
      'Deeper_3.html': page('Deeper', ['Home_1.html', 'Lost_2.html']),
      'Orphan_4.html': page('Orphan', []),
    });
    try {
      const { pagesMap } = await service.prepare(dir);
      const home = pagesMap.get('Home_1.html');
      const lost = pagesMap.get('Lost_2.html');
      expect(lost.parentPageId).toBe(home.id);
      expect(pagesMap.get('Deeper_3.html').parentPageId).toBe(lost.id);
      expect(pagesMap.get('Orphan_4.html').parentPageId).toBeNull();
      expect(lost.name).toBe('Lost');
    } finally {
      await fs.rm(dir, { recursive: true, force: true });
    }
  });

  it('rejects an archive without pages', async () => {
    const dir = await writeExport({ 'readme.txt': 'hi' });
    try {
      await expect(service.prepare(dir)).rejects.toThrow(/No pages found/);
    } finally {
      await fs.rm(dir, { recursive: true, force: true });
    }
  });
});
