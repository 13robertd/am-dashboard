import type { Property } from "@/types/portfolio";
import { parseRentRoll } from "./rentRoll";
import { parseIncomeStatement } from "./incomeStatement";
import { parseExpiringLeases } from "./expiringLeases";
import { parseAgedReceivables } from "./agedReceivables";
import {
  detectReportType,
  EntrataParseError,
  firstSheetRows,
  readWorkbook,
  type Bytes,
} from "./shared/sheet";
import { slugify } from "./shared/metadata";
import {
  composeProperty,
  type PropertyMeta,
  type ReportPayload,
} from "./compose";
import type { EntrataReportType } from "./shared/types";

// Public Entrata adapter. Two entry points now coexist:
//
//   parseEntrataReports(files)
//     The legacy "all-at-once" path used by the upload modal. Parses every
//     supplied file, then delegates to composeProperty to assemble them.
//     Returns a single merged Property.
//
//   parseSingleReport(reportType, bytes)
//     The Supabase-backed path. Parses one file, returns its parsed payload
//     (the shape stored in `reports.parsed_data`). The page assembles per-
//     property reports via composeProperty on read.
//
// Both routes share the per-parser implementations and the composeProperty
// merge step, so output is identical.

export interface EntrataUpload {
  rentRoll?: Bytes;
  incomeStatement?: Bytes;
  expiringLeases?: Bytes;
  agedReceivables?: Bytes;
  workOrders?: Bytes;
}

export interface EntrataParseResult {
  property: Property;
  warnings: string[];
  reportsParsed: Array<keyof EntrataUpload>;
  reportsMissing: Array<keyof EntrataUpload>;
}

const ALL_REPORTS: Array<keyof EntrataUpload> = [
  "rentRoll",
  "incomeStatement",
  "expiringLeases",
  "agedReceivables",
  "workOrders",
];

// Map between the legacy slot keys and the canonical report_type strings
// stored in the database.
export const SLOT_TO_REPORT_TYPE = {
  rentRoll: "rent_roll",
  incomeStatement: "income_statement_t12",
  expiringLeases: "expiring_leases",
  agedReceivables: "aged_receivables",
  workOrders: "work_orders",
} as const satisfies Record<keyof EntrataUpload, string>;

export type SlotKey = keyof EntrataUpload;

export async function parseEntrataReports(
  files: EntrataUpload,
): Promise<EntrataParseResult> {
  const parsed: Array<keyof EntrataUpload> = [];
  const missing: Array<keyof EntrataUpload> = [];
  for (const r of ALL_REPORTS) {
    if (files[r]) parsed.push(r);
    else missing.push(r);
  }

  if (!files.rentRoll) {
    throw new EntrataParseError(
      "A Rent Roll is required — it defines the property's unit list.",
    );
  }

  const reports: ReportPayload[] = [];
  reports.push({ reportType: "rent_roll", data: parseRentRoll(files.rentRoll) });

  if (files.incomeStatement) {
    reports.push({
      reportType: "income_statement_t12",
      data: parseIncomeStatement(files.incomeStatement),
    });
  }
  if (files.expiringLeases) {
    reports.push({
      reportType: "expiring_leases",
      data: parseExpiringLeases(files.expiringLeases),
    });
  }
  if (files.agedReceivables) {
    reports.push({
      reportType: "aged_receivables",
      data: parseAgedReceivables(files.agedReceivables),
    });
  }
  // workOrders intentionally not parsed yet — accepted but no parser exists.

  // The legacy path doesn't have a stored property row to draw metadata from,
  // so we synthesize an id from the parsed property name.
  const rentRollData = reports[0]!.data as Awaited<
    ReturnType<typeof parseRentRoll>
  >;
  const slug = slugify(rentRollData.propertyName) || "uploaded";
  const meta: PropertyMeta = {
    id: `uploaded-${slug}`,
    name: "", // empty so composeProperty falls back to the parsed name
    ownerName: "",
    address: { street: "", city: "", state: "", zip: "" },
  };

  const { property, warnings } = composeProperty(meta, reports);

  return {
    property,
    warnings,
    reportsParsed: parsed,
    reportsMissing: missing,
  };
}

// Stage 3: per-report upload path used by the Supabase-backed flow. Each
// file is parsed independently; the returned payload is what we'll write
// into `reports.parsed_data`.
export function parseSingleReport(
  slot: SlotKey,
  bytes: Bytes,
): ReportPayload | null {
  switch (slot) {
    case "rentRoll":
      return { reportType: "rent_roll", data: parseRentRoll(bytes) };
    case "incomeStatement":
      return {
        reportType: "income_statement_t12",
        data: parseIncomeStatement(bytes),
      };
    case "expiringLeases":
      return { reportType: "expiring_leases", data: parseExpiringLeases(bytes) };
    case "agedReceivables":
      return {
        reportType: "aged_receivables",
        data: parseAgedReceivables(bytes),
      };
    case "workOrders":
      // Not yet parsed — return null so the caller can skip the DB write.
      return null;
  }
}

// Public, lightweight detector — used by the modal to attribute wrong-slot
// errors to the offending file before the heavy parse runs. Returns "unknown"
// when the file isn't recognisable (it might still parse if dropped in the
// right slot, but we can't pre-validate).
export function detectEntrataReportType(input: Bytes): EntrataReportType {
  try {
    const wb = readWorkbook(input);
    const rows = firstSheetRows(wb);
    return detectReportType(rows);
  } catch {
    return "unknown";
  }
}

export type { EntrataReportType } from "./shared/types";
export { EntrataParseError } from "./shared/sheet";
export { composeProperty } from "./compose";
export type { ReportPayload, PropertyMeta } from "./compose";
