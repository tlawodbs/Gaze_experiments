// Minimal CSV utility. Avoids a runtime dep and is safe for ASCII sentences.

function escapeCell(value: unknown): string {
  if (value === null || value === undefined) return "";
  const s = String(value);
  if (/[",\n\r]/.test(s)) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

export function toCSV<T>(rows: T[], columns: (keyof T)[]): string {
  const header = columns.map((c) => escapeCell(String(c))).join(",");
  const body = rows
    .map((row) =>
      columns
        .map((c) => escapeCell((row as Record<string, unknown>)[c as string]))
        .join(","),
    )
    .join("\n");
  return rows.length === 0 ? header + "\n" : header + "\n" + body + "\n";
}
