import { normalizePageRef } from './page-ref';

describe('normalizePageRef', () => {
  it('keeps ids and slug ids', () => {
    expect(normalizePageRef('01a17ad8-717d-767f-9a95-424f8ef9f18d')).toBe(
      '01a17ad8-717d-767f-9a95-424f8ef9f18d',
    );
    expect(normalizePageRef('mk9C3UWqG7')).toBe('mk9C3UWqG7');
  });

  it('takes the slug id from a URL slug or a page URL', () => {
    expect(normalizePageRef('codex-mcp-mk9C3UWqG7')).toBe('mk9C3UWqG7');
    expect(
      normalizePageRef('http://localhost:5173/s/linh-tinh/p/codex-mcp-mk9C3UWqG7'),
    ).toBe('mk9C3UWqG7');
    expect(normalizePageRef('/s/x/p/abc123XYZ#heading')).toBe('abc123XYZ');
  });
});
