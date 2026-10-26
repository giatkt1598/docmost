import {
  CellValidationError,
  defaultCells,
  normalizeTypeOptions,
  parseFilter,
  validateCells,
  viewConfigSchema,
} from './schema.zod';
import { EngineProperty } from './base.types';

const props = new Map<string, EngineProperty>(
  [
    { id: 't', type: 'text', typeOptions: {} },
    { id: 'n', type: 'number', typeOptions: {} },
    {
      id: 's',
      type: 'status',
      typeOptions: { choices: [{ id: 'a', name: 'A', color: 'gray' }] },
    },
    { id: 'f', type: 'formula', typeOptions: {} },
    { id: 'c', type: 'createdAt', typeOptions: {} },
  ].map((p) => [p.id, p]),
);

describe('validateCells', () => {
  it('accepts valid values and clears blanks', () => {
    expect(validateCells({ t: 'hi', n: 3, s: 'a' }, props)).toEqual({
      t: 'hi',
      n: 3,
      s: 'a',
    });
    expect(validateCells({ t: '', n: null }, props)).toEqual({ t: null, n: null });
  });

  it('rejects unknown properties, bad values and read-only types', () => {
    expect(() => validateCells({ nope: 1 }, props)).toThrow(CellValidationError);
    expect(() => validateCells({ n: 'x' }, props)).toThrow(CellValidationError);
    expect(() => validateCells({ s: 'zzz' }, props)).toThrow(CellValidationError);
    expect(() => validateCells({ f: 1 }, props)).toThrow(CellValidationError);
    expect(() => validateCells({ c: '2020-01-01' }, props)).toThrow(CellValidationError);
    expect(() => validateCells({ t: 'x'.repeat(1001) }, props)).toThrow(CellValidationError);
  });
});

describe('normalizeTypeOptions', () => {
  it('rebuilds choiceOrder from the choices', () => {
    const out = normalizeTypeOptions('select', {
      choices: [
        { id: 'a', name: 'A', color: 'red' },
        { id: 'b', name: 'B', color: 'red' },
      ],
      choiceOrder: ['b', 'ghost'],
    });
    expect(out.choiceOrder).toEqual(['b', 'a']);
  });

  it('rejects duplicate choice ids and unknown types', () => {
    expect(() =>
      normalizeTypeOptions('select', {
        choices: [
          { id: 'a', name: 'A', color: 'red' },
          { id: 'a', name: 'B', color: 'red' },
        ],
      }),
    ).toThrow();
    expect(() => normalizeTypeOptions('bogus', {})).toThrow();
  });

  it('accepts date display options up to 64 characters', () => {
    const format = 'dddd, D MMMM YYYY [at] HH:mm'.padEnd(64, ' ');
    expect(
      normalizeTypeOptions('date', { dateFormat: format, includeTime: true }),
    ).toMatchObject({ dateFormat: format, includeTime: true });
    expect(() =>
      normalizeTypeOptions('date', { dateFormat: 'x'.repeat(65) }),
    ).toThrow();
  });

  it.each(['createdAt', 'lastEditedAt'])(
    'accepts date display options for %s',
    (type) => {
      const opts = {
        dateFormat: 'DD/MM/YYYY HH:mm',
        includeTime: true,
        timeFormat: '12h',
      };
      expect(normalizeTypeOptions(type, opts)).toMatchObject(opts);
      expect(() =>
        normalizeTypeOptions(type, { dateFormat: 'x'.repeat(65) }),
      ).toThrow();
      expect(() =>
        normalizeTypeOptions(type, { timeFormat: '13h' }),
      ).toThrow();
      expect(() => normalizeTypeOptions(type, { includeTime: 'yes' })).toThrow();
    },
  );
});

describe('defaultCells', () => {
  it('uses defaults of writable properties', () => {
    const list: EngineProperty[] = [
      { id: 's', type: 'status', typeOptions: { defaultValue: 'a' } },
      { id: 'k', type: 'checkbox', typeOptions: { defaultValue: false } },
      { id: 'n', type: 'number', typeOptions: {} },
    ];
    expect(defaultCells(list)).toEqual({ s: 'a' });
  });
});

describe('parseFilter', () => {
  it('rejects deeply nested filters', () => {
    let f: any = { propertyId: 'a', op: 'eq', value: 1 };
    for (let i = 0; i < 10; i++) f = { op: 'and', children: [f] };
    expect(() => parseFilter(f)).toThrow();
  });
});

describe('viewConfigSchema', () => {
  it('accepts fullWidth as a boolean', () => {
    expect(viewConfigSchema.parse({ fullWidth: true })).toEqual({ fullWidth: true });
    expect(viewConfigSchema.parse({ fullWidth: false })).toEqual({ fullWidth: false });
    expect(() => viewConfigSchema.parse({ fullWidth: 'yes' })).toThrow();
    expect(() => viewConfigSchema.parse({ fullWidth: null })).toThrow();
  });

  it('validates a patch the way views/update does: set keys only, null removes', () => {
    // BaseViewService.update strips null keys (they delete the key) before
    // validating the keys that are being set
    const patch = { fullWidth: true, groupByPropertyId: 'p' };
    expect(viewConfigSchema.partial().parse(patch)).toEqual(patch);
    expect(() => viewConfigSchema.partial().parse({ fullWidth: 1 })).toThrow();
  });

  it('still rejects unknown keys', () => {
    expect(() => viewConfigSchema.parse({ full_width: true })).toThrow();
  });
});
