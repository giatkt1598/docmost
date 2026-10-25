import { convertCell } from './type-conversion';

const choices = (...names: string[]) => ({
  choices: names.map((n, i) => ({ id: `o${i}`, name: n, color: 'gray' })),
  choiceOrder: names.map((_, i) => `o${i}`),
});

describe('convertCell', () => {
  const select = { type: 'select', typeOptions: choices('Red', 'Blue') };
  const multi = { type: 'multiSelect', typeOptions: choices('Red', 'Blue') };
  const text = { type: 'text', typeOptions: {} };
  const number = { type: 'number', typeOptions: {} };

  it('turns a choice into its name', () => {
    expect(convertCell('o1', select, text)).toBe('Blue');
  });

  it('joins multi select names', () => {
    expect(convertCell(['o0', 'o1'], multi, text)).toBe('Red, Blue');
  });

  it('keeps the first value when going multi to single', () => {
    expect(convertCell(['o1', 'o0'], multi, select)).toBe('o1');
  });

  it('wraps a single choice into a list', () => {
    expect(convertCell('o0', select, multi)).toEqual(['o0']);
  });

  it('matches text to a choice by name, ignoring case', () => {
    expect(convertCell(' blue ', text, select)).toBe('o1');
    expect(convertCell('green', text, select)).toBeNull();
  });

  it('splits text into multi select choices', () => {
    expect(convertCell('Red, Blue, Nope', text, multi)).toEqual(['o0', 'o1']);
  });

  it('parses numbers and clears the rest', () => {
    expect(convertCell('1,250.5', text, number)).toBe(1250.5);
    expect(convertCell('abc', text, number)).toBeNull();
    expect(convertCell(true, { type: 'checkbox', typeOptions: {} }, number)).toBeNull();
  });

  it('coerces checkboxes', () => {
    const checkbox = { type: 'checkbox', typeOptions: {} };
    expect(convertCell('yes', text, checkbox)).toBe(true);
    expect(convertCell('nope', text, checkbox)).toBe(false);
    expect(convertCell(0, number, checkbox)).toBe(false);
  });

  it('normalizes dates to ISO and clears invalid ones', () => {
    const date = { type: 'date', typeOptions: {} };
    expect(convertCell('2024-03-05T10:00:00Z', text, date)).toBe(
      '2024-03-05T10:00:00.000Z',
    );
    expect(convertCell('nonsense', text, date)).toBeNull();
  });

  it('validates urls and emails', () => {
    expect(convertCell('https://a.io', text, { type: 'url', typeOptions: {} })).toBe(
      'https://a.io',
    );
    expect(convertCell('a.io', text, { type: 'url', typeOptions: {} })).toBeNull();
    expect(convertCell('a@b.co', text, { type: 'email', typeOptions: {} })).toBe('a@b.co');
    expect(convertCell('a@b', text, { type: 'email', typeOptions: {} })).toBeNull();
  });

  it('uses looked up names for people and pages', () => {
    const person = { type: 'person', typeOptions: {} };
    const lookups = {
      userNames: new Map([['u1', 'Ada']]),
      pageTitles: new Map([['p1', 'Home']]),
    };
    expect(convertCell('u1', person, text, lookups)).toBe('Ada');
    expect(convertCell('p1', { type: 'page', typeOptions: {} }, text, lookups)).toBe('Home');
  });

  it('truncates long text going to text', () => {
    const long = { type: 'longText', typeOptions: {} };
    const out = convertCell('x'.repeat(2000), long, text) as string;
    expect(out).toHaveLength(1000);
  });

  it('never carries error cells over', () => {
    const err = { __err: 'DIV_BY_ZERO', msg: 'x', v: 1 };
    expect(convertCell(err, number, text)).toBeNull();
  });
});
