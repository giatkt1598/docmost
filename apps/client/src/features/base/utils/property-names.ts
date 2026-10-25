// "Status", "Status 2", "Status 3"… (names are unique ignoring case).
export function uniquePropertyName(wanted: string, existing: string[]): string {
  const taken = new Set(existing.map((n) => n.trim().toLowerCase()));
  const base = wanted.trim() || "Property";
  if (!taken.has(base.toLowerCase())) return base;
  for (let i = 2; ; i++) {
    const name = `${base} ${i}`;
    if (!taken.has(name.toLowerCase())) return name;
  }
}
