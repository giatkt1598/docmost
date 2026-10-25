export class CsvParseError extends Error {}

// Parses RFC 4180 CSV: quoted fields, doubled quotes, CRLF or LF line ends,
// and a leading byte order mark. Stops with an error past `maxRecords`.
export function parseCsv(text: string, maxRecords: number): string[][] {
  const src = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
  const records: string[][] = [];
  let record: string[] = [];
  let field = '';
  let inQuotes = false;
  let i = 0;

  const endField = () => {
    record.push(field);
    field = '';
  };
  const endRecord = () => {
    endField();
    records.push(record);
    record = [];
    if (records.length > maxRecords) {
      throw new CsvParseError(`The file has more than ${maxRecords} rows`);
    }
  };

  while (i < src.length) {
    const c = src[i];
    if (inQuotes) {
      if (c === '"') {
        if (src[i + 1] === '"') {
          field += '"';
          i += 2;
          continue;
        }
        inQuotes = false;
        i++;
        continue;
      }
      field += c;
      i++;
      continue;
    }
    if (c === '"' && field === '') {
      inQuotes = true;
    } else if (c === ',') {
      endField();
    } else if (c === '\r' || c === '\n') {
      endRecord();
      if (c === '\r' && src[i + 1] === '\n') i++;
    } else {
      field += c;
    }
    i++;
  }
  if (inQuotes) throw new CsvParseError('Unterminated quoted field');
  if (field !== '' || record.length > 0) endRecord();
  return records;
}
