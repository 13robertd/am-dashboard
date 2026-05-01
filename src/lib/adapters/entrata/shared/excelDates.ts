// Convert an Excel serial date number to ISO 8601 (YYYY-MM-DD).
//
// Excel's epoch is 1899-12-30 (driven by a deliberate compatibility bug:
// Excel treats 1900 as a leap year, so serial 60 corresponds to a fictitious
// 1900-02-29). The constant 25569 is the count of days from Excel's 1900-01-00
// to the Unix epoch (1970-01-01); for any serial >= 61 (i.e. >= 1900-03-01)
// the conversion is exact.
export function excelSerialToISO(serial: number): string {
  const ms = Math.round((serial - 25569) * 86400 * 1000);
  return new Date(ms).toISOString().slice(0, 10);
}

// Some date cells come through as strings (e.g. "04/01/2026") when the column
// is not formatted as a date. Accept both.
export function toISODate(value: unknown): string | null {
  if (value === null || value === undefined || value === "") return null;
  if (typeof value === "number") return excelSerialToISO(value);
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  if (typeof value === "string") {
    const m = value.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
    if (m) {
      const [, mm, dd, yyyy] = m;
      return `${yyyy}-${mm.padStart(2, "0")}-${dd.padStart(2, "0")}`;
    }
    if (/^\d{4}-\d{2}-\d{2}/.test(value)) return value.slice(0, 10);
  }
  return null;
}
