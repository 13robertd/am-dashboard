import type { Row } from "./sheet";
import { asString } from "./sheet";

// Most Entrata exports put the property name on the first non-empty row after
// the title. Aged Receivables sometimes lists multiple property names joined
// by commas (residential + commercial); we keep only the first.
export function extractPropertyName(rows: Row[]): string {
  // Skip the first non-empty row (title), find the next.
  let seenTitle = false;
  for (let i = 0; i < Math.min(rows.length, 8); i += 1) {
    const text = asString(rows[i]?.[0] ?? null)?.trim();
    if (!text) continue;
    if (!seenTitle) {
      seenTitle = true;
      continue;
    }
    return text.split(",")[0].trim();
  }
  return "";
}

// Period varies in format ("Apr 2026", "May 2025 - Apr 2026", "04/01/2026 - 04/30/2026").
// We just hand it back as a string — callers normalise where needed.
export function extractPeriod(rows: Row[], lookahead = 6): string {
  let titleSeen = false;
  let nameSeen = false;
  for (let i = 0; i < Math.min(rows.length, lookahead); i += 1) {
    const text = asString(rows[i]?.[0] ?? null)?.trim();
    if (!text) continue;
    if (!titleSeen) {
      titleSeen = true;
      continue;
    }
    if (!nameSeen) {
      nameSeen = true;
      continue;
    }
    // Income Statement slips an "Accrual Basis" line in here; skip it.
    if (/^accrual basis$/i.test(text) || /^cash basis$/i.test(text)) continue;
    return text;
  }
  return "";
}

// Convert a free-form period into an ISO YYYY-MM-01 string for the
// `Property.reportingPeriod` field. Falls back to today if unparseable.
const MONTH_LOOKUP: Record<string, number> = {
  jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6,
  jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12,
};

export function periodToReportingISO(period: string): string {
  // "Apr 2026" — single-month period.
  const single = period.match(/([A-Za-z]+)\s+(\d{4})/);
  // "May 2025 - Apr 2026" — pick the LAST month (the report's "as of" point).
  const range = period.match(/([A-Za-z]+\s+\d{4})\s*-\s*([A-Za-z]+\s+\d{4})/);
  const dateRange = period.match(/(\d{2})\/(\d{2})\/(\d{4})\s*-\s*(\d{2})\/(\d{2})\/(\d{4})/);

  if (range) {
    const last = range[2].match(/([A-Za-z]+)\s+(\d{4})/);
    if (last) return monthYearToISO(last[1], Number(last[2]));
  }
  if (dateRange) {
    return `${dateRange[6]}-${dateRange[4]}-01`;
  }
  if (single) {
    return monthYearToISO(single[1], Number(single[2]));
  }
  return new Date().toISOString().slice(0, 7) + "-01";
}

function monthYearToISO(monthWord: string, year: number): string {
  const m = MONTH_LOOKUP[monthWord.slice(0, 3).toLowerCase()];
  if (!m) return `${year}-01-01`;
  return `${year}-${String(m).padStart(2, "0")}-01`;
}

// Slugify a property name into a stable id segment.
export function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 64);
}
