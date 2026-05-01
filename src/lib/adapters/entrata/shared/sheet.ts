import * as XLSX from "xlsx";
import type { EntrataReportType } from "./types";

// Each sheet is read as a 2-D array of cells. Empty cells are `null`.
export type Cell = string | number | boolean | null;
export type Row = Cell[];

// Accepts anything our parsers might be handed: a browser File's ArrayBuffer,
// a Node Buffer (which is also a Uint8Array), or a Uint8Array.
export type Bytes = ArrayBuffer | Uint8Array;

export class EntrataParseError extends Error {
  constructor(
    message: string,
    public readonly hint?: string,
  ) {
    super(message);
    this.name = "EntrataParseError";
  }
}

function toUint8Array(input: Bytes): Uint8Array {
  if (input instanceof Uint8Array) return input;
  return new Uint8Array(input);
}

export function readWorkbook(input: Bytes): XLSX.WorkBook {
  try {
    return XLSX.read(toUint8Array(input), { type: "array", cellDates: false });
  } catch (err) {
    throw new EntrataParseError(
      "Couldn't read this file. Make sure it's an Entrata XLSX export, not a PDF or screenshot.",
      err instanceof Error ? err.message : String(err),
    );
  }
}

// Returns the first sheet's rows. Entrata reports always put data on the first
// sheet; the second sheet ("Report Parameters") is a metadata footer we ignore.
export function firstSheetRows(wb: XLSX.WorkBook): Row[] {
  const name = wb.SheetNames[0];
  if (!name) {
    throw new EntrataParseError(
      "This file has no sheets. Was it exported correctly?",
    );
  }
  const ws = wb.Sheets[name];
  if (!ws) {
    throw new EntrataParseError("Couldn't find a sheet to parse.");
  }
  return XLSX.utils.sheet_to_json<Row>(ws, {
    header: 1,
    raw: true,
    defval: null,
  });
}

// Identify which Entrata report this file is, using the title row. Used both
// to defend the parsers (header check) and for wrong-slot detection later.
export function detectReportType(rows: Row[]): EntrataReportType {
  const titleRow = rows
    .slice(0, 6)
    .find((r) => typeof r[0] === "string" && (r[0] as string).trim() !== "");
  const title = typeof titleRow?.[0] === "string" ? (titleRow[0] as string).toLowerCase() : "";
  if (title.includes("rent roll")) return "rentRoll";
  if (title.includes("income statement")) return "incomeStatement";
  if (title.includes("expiring leases")) return "expiringLeases";
  if (title.includes("resident aged receivables")) return "agedReceivables";
  if (title.includes("work order")) return "workOrders";
  return "unknown";
}

// Locate the column-header row by searching for a known anchor cell (e.g.
// "Bldg-Unit"). Returns -1 if not found. Header positions vary slightly
// between report types; locating by content is more robust than counting rows.
export function findHeaderRow(rows: Row[], firstHeader: string): number {
  for (let i = 0; i < Math.min(rows.length, 20); i += 1) {
    const cell = rows[i]?.[0];
    if (typeof cell === "string" && cell.trim() === firstHeader) return i;
  }
  return -1;
}

export function asString(v: Cell): string | null {
  if (v === null || v === undefined) return null;
  return typeof v === "string" ? v : String(v);
}

export function asNumber(v: Cell): number | null {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string" && v.trim() !== "") {
    const n = Number(v.replace(/,/g, ""));
    return Number.isFinite(n) ? n : null;
  }
  return null;
}
