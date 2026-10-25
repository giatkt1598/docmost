import {
  dateAdd,
  dateBetween,
  formatDate,
  parseDateUnit,
  startOfUtcDay,
} from './date-utils';

const d = (iso: string) => new Date(iso);

describe('parseDateUnit', () => {
  it('accepts singular and plural units in any case', () => {
    expect(parseDateUnit('days')).toBe('days');
    expect(parseDateUnit('Day')).toBe('days');
    expect(parseDateUnit(' MONTHS ')).toBe('months');
    expect(parseDateUnit('minute')).toBe('minutes');
    expect(parseDateUnit('seconds')).toBeNull();
  });
});

describe('dateAdd', () => {
  it('clamps the day when adding months and years', () => {
    expect(dateAdd(d('2024-01-31T00:00:00Z'), 1, 'months').toISOString()).toBe(
      '2024-02-29T00:00:00.000Z',
    );
    expect(dateAdd(d('2024-02-29T08:00:00Z'), 1, 'years').toISOString()).toBe(
      '2025-02-28T08:00:00.000Z',
    );
    expect(dateAdd(d('2024-03-31T00:00:00Z'), -1, 'months').toISOString()).toBe(
      '2024-02-29T00:00:00.000Z',
    );
    expect(dateAdd(d('2024-11-15T00:00:00Z'), 14, 'months').toISOString()).toBe(
      '2026-01-15T00:00:00.000Z',
    );
  });

  it('adds fixed units', () => {
    const base = d('2024-01-01T00:00:00Z');
    expect(dateAdd(base, 1.5, 'days').toISOString()).toBe(
      '2024-01-02T12:00:00.000Z',
    );
    expect(dateAdd(base, 1, 'weeks').toISOString()).toBe(
      '2024-01-08T00:00:00.000Z',
    );
    expect(dateAdd(base, -1, 'hours').toISOString()).toBe(
      '2023-12-31T23:00:00.000Z',
    );
    expect(dateAdd(base, 30, 'minutes').toISOString()).toBe(
      '2024-01-01T00:30:00.000Z',
    );
  });
});

describe('dateBetween', () => {
  it('counts whole calendar months and years', () => {
    expect(
      dateBetween(
        d('2024-03-14T00:00:00Z'),
        d('2024-01-15T00:00:00Z'),
        'months',
      ),
    ).toBe(1);
    expect(
      dateBetween(
        d('2024-03-15T00:00:00Z'),
        d('2024-01-15T00:00:00Z'),
        'months',
      ),
    ).toBe(2);
    expect(
      dateBetween(
        d('2024-01-15T00:00:00Z'),
        d('2024-03-14T00:00:00Z'),
        'months',
      ),
    ).toBe(-1);
    expect(
      dateBetween(
        d('2026-01-01T00:00:00Z'),
        d('2024-01-02T00:00:00Z'),
        'years',
      ),
    ).toBe(1);
    expect(
      dateBetween(
        d('2026-01-02T00:00:00Z'),
        d('2024-01-02T00:00:00Z'),
        'years',
      ),
    ).toBe(2);
  });

  it('truncates fixed units toward zero', () => {
    const a = d('2024-01-03T23:00:00Z');
    const b = d('2024-01-01T00:00:00Z');
    expect(dateBetween(a, b, 'days')).toBe(2);
    expect(dateBetween(b, a, 'days')).toBe(-2);
    expect(dateBetween(a, b, 'hours')).toBe(71);
    expect(dateBetween(a, b, 'weeks')).toBe(0);
  });
});

describe('formatDate', () => {
  const date = d('2026-10-05T14:07:03Z'); // a Monday

  it.each([
    ['YYYY YY', '2026 26'],
    ['MMMM MMM MM M', 'October Oct 10 10'],
    ['DD D', '05 5'],
    ['dddd ddd', 'Monday Mon'],
    ['HH H hh h', '14 14 02 2'],
    ['mm ss', '07 03'],
    ['A a', 'PM pm'],
    ['MMM D, YYYY', 'Oct 5, 2026'],
    ['DD/MM/YYYY HH:mm', '05/10/2026 14:07'],
    ['YYYY-MM-DD', '2026-10-05'],
    ['[Today is] dddd', 'Today is Monday'],
    ['[YYYY] YYYY', 'YYYY 2026'],
    ['', ''],
  ])('%j -> %j', (format, expected) => {
    expect(formatDate(date, format)).toBe(expected);
  });

  it('uses 12 for midnight and noon in 12h tokens', () => {
    expect(formatDate(d('2026-01-01T00:05:00Z'), 'h:mm A')).toBe('12:05 AM');
    expect(formatDate(d('2026-01-01T12:05:00Z'), 'h:mm a')).toBe('12:05 pm');
  });
});

describe('startOfUtcDay', () => {
  it('drops the time', () => {
    expect(startOfUtcDay(d('2026-01-01T23:59:59Z')).toISOString()).toBe(
      '2026-01-01T00:00:00.000Z',
    );
  });
});
