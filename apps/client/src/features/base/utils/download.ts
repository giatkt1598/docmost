// Reads the file name of a Content-Disposition header. RFC 5987
// `filename*=UTF-8''…` wins over a plain `filename=`.
export function fileNameFromDisposition(
  header: string | null | undefined,
): string | null {
  if (!header) return null;
  const extended = /filename\*\s*=\s*([^']*)'[^']*'([^;]+)/i.exec(header);
  if (extended) {
    try {
      return decodeURIComponent(extended[2].trim().replace(/^"|"$/g, ""));
    } catch {
      // fall through to the plain parameter
    }
  }
  const plain = /filename\s*=\s*("([^"]*)"|[^;]+)/i.exec(header);
  if (plain) {
    const raw = (plain[2] ?? plain[1]).trim();
    try {
      return decodeURIComponent(raw);
    } catch {
      return raw;
    }
  }
  return null;
}
