import { MermaidValidator } from './mermaid-validator';

describe('MermaidValidator', () => {
  const validator = new MermaidValidator();
  afterAll(() => validator.onModuleDestroy());

  it('accepts sequence diagrams, mindmaps and flowcharts', async () => {
    await expect(
      validator.check('sequenceDiagram\n  A->>B: hi\n  alt ok\n    B-->>A: yes\n  end'),
    ).resolves.toMatchObject({ ok: true, type: 'sequence' });
    await expect(
      validator.check('mindmap\n  root((Docmost))\n    AI\n      MCP\n    Search'),
    ).resolves.toMatchObject({ ok: true, type: 'mindmap' });
    await expect(
      validator.check('flowchart LR\n  A[Start] --> B{Ok?}\n  B -->|yes| C'),
    ).resolves.toMatchObject({ ok: true });
  }, 30_000);

  it('reports syntax errors', async () => {
    const bad = await validator.check('sequenceDiagram\n  A->>: oops');
    expect(bad.ok).toBe(false);
    expect(
      MermaidValidator.describe(bad.error),
    ).toMatch(/Parse error on line 2/);
    const unknown = await validator.check('notadiagram\n  x');
    expect(unknown.ok).toBe(false);
  }, 30_000);
});
