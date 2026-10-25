import {
  DummyDriver,
  Kysely,
  PostgresAdapter,
  PostgresIntrospector,
  PostgresQueryCompiler,
} from 'kysely';
import { CsvParseError, parseCsv } from './csv-parse';
import { compileSearch } from './search-compiler';
import { EngineProperty } from './base.types';
import { BaseNotificationService } from '../base-notification.service';

const db = new Kysely<any>({
  dialect: {
    createAdapter: () => new PostgresAdapter(),
    createDriver: () => new DummyDriver(),
    createIntrospector: (k) => new PostgresIntrospector(k),
    createQueryCompiler: () => new PostgresQueryCompiler(),
  },
});

describe('parseCsv', () => {
  it('handles quotes, doubled quotes, CRLF and a BOM', () => {
    const text = '﻿Name,Note\r\n"Smith, Ann","said ""hi"""\r\nBob,"two\nlines"\n';
    expect(parseCsv(text, 10)).toEqual([
      ['Name', 'Note'],
      ['Smith, Ann', 'said "hi"'],
      ['Bob', 'two\nlines'],
    ]);
  });

  it('keeps empty fields and a last line without newline', () => {
    expect(parseCsv('a,,c\n1,2,', 10)).toEqual([
      ['a', '', 'c'],
      ['1', '2', ''],
    ]);
  });

  it('rejects unterminated quotes and too many rows', () => {
    expect(() => parseCsv('a,"b', 10)).toThrow(CsvParseError);
    expect(() => parseCsv('a\nb\nc\n', 2)).toThrow(CsvParseError);
  });
});

describe('compileSearch', () => {
  const props: EngineProperty[] = [
    { id: 'title', type: 'text', typeOptions: {} },
    { id: 'qty', type: 'number', typeOptions: {} },
    {
      id: 'st',
      type: 'status',
      typeOptions: { choices: [{ id: 'c1', name: 'In progress' }, { id: 'c2', name: 'Done' }] },
    },
    { id: 'who', type: 'person', typeOptions: { allowMultiple: true } },
  ];

  it('is null for a blank term', () => {
    expect(compileSearch('  ', props)).toBeNull();
  });

  it('matches text with escaped wildcards and choices by name', () => {
    const c = compileSearch('progress_%', props)!.compile(db);
    expect(c.parameters).toContain('%progress\\_\\%%');
    expect(c.sql).toContain('ilike');
    expect(c.sql).not.toContain('any(');
    const s = compileSearch('PROG', props)!.compile(db);
    expect(s.parameters).toContain('c1');
    expect(s.parameters).not.toContain('c2');
  });

  it('compares numbers only for numeric terms', () => {
    expect(compileSearch('12', props)!.compile(db).parameters).toContain(12);
    expect(compileSearch('abc', props)!.compile(db).parameters).not.toContain(NaN);
  });
});

describe('BaseNotificationService.newAssignees', () => {
  const properties: any[] = [
    { id: 'owner', type: 'person', name: 'Owner' },
    { id: 'team', type: 'person', name: 'Team' },
    { id: 'title', type: 'text', name: 'Title' },
  ];
  const row: any = { cells: { owner: 'u1', team: ['u2', 'u3', 'me'] } };

  it('returns only people who were added, without the actor', () => {
    const out = BaseNotificationService.newAssignees(
      row,
      properties,
      { owner: 'u1', team: ['u2'] },
      'me',
    );
    expect([...out.entries()]).toEqual([['u3', 'Team']]);
  });

  it('treats a new row as all added', () => {
    const out = BaseNotificationService.newAssignees(row, properties, null, 'me');
    expect([...out.keys()].sort()).toEqual(['u1', 'u2', 'u3']);
  });
});
