export function escapeCsvField(value: unknown): string {
  if (value === null || value === undefined) return "";
  const str = String(value);
  const needsEscape = /[",\n\r]/.test(str) || /^[=+\-@]/.test(str);
  if (!needsEscape) return str;
  return `"${str.replace(/"/g, '""')}"`;
}

export function toCsvRow(fields: unknown[]): string {
  return fields.map(escapeCsvField).join(",");
}

export function toCsv(rows: unknown[][], headers?: string[]): string {
  const lines: string[] = [];
  if (headers) {
    lines.push(toCsvRow(headers));
  }
  for (const row of rows) {
    lines.push(toCsvRow(row));
  }
  return lines.join("\n");
}