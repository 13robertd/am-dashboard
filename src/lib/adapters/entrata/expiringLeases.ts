import {
  asNumber,
  asString,
  detectReportType,
  EntrataParseError,
  findHeaderRow,
  firstSheetRows,
  readWorkbook,
  type Bytes,
  type Row,
} from "./shared/sheet";
import { excelSerialToISO } from "./shared/excelDates";
import { extractPeriod, extractPropertyName } from "./shared/metadata";
import type { ExpiringLeaseRow, ExpiringLeasesResult } from "./shared/types";

const COL = {
  bldgUnit: 0,
  unitType: 1,
  resident: 2,
  leaseIntervalStatus: 3,
  email: 4,
  leaseStatus: 5,
  primaryPhone: 6,
  leaseStart: 7,
  leaseEnd: 8,
  moveOut: 9,
  depositHeld: 10,
  scheduledCharges: 11,
} as const;

// Section labels (e.g. "APR 2026", "Month to Month") sit on their own row in
// column 0 and have everything else null. The "Total:" footer rows have null
// in column 0 and "Total:" in column 1.
function isSectionLabel(row: Row): boolean {
  const a = asString(row[COL.bldgUnit] ?? null)?.trim();
  if (!a) return false;
  // Anything in column 0 that isn't a unit identifier and is followed by all
  // nulls (or near-all nulls) is treated as a label/section header.
  const restMostlyNull = row.slice(1, 8).every((c) => c === null || c === "");
  return restMostlyNull;
}

function isTotalRow(row: Row): boolean {
  const b = asString(row[1] ?? null)?.trim();
  return b !== null && /^total:?$/i.test(b ?? "");
}

function isUnitDataRow(row: Row): boolean {
  const a = row[COL.bldgUnit];
  if (a === null || a === undefined || a === "") return false;
  const text = typeof a === "string" ? a.trim() : String(a);
  if (text === "") return false;
  // Section labels live alone in column 0; data rows have a resident name too.
  const resident = asString(row[COL.resident] ?? null)?.trim();
  return resident !== null && resident !== "";
}

export function parseExpiringLeases(input: Bytes): ExpiringLeasesResult {
  const wb = readWorkbook(input);
  const rows = firstSheetRows(wb);

  const reportType = detectReportType(rows);
  if (reportType !== "expiringLeases" && reportType !== "unknown") {
    throw new EntrataParseError(
      `This looks like a different report (${reportType}), not Expiring Leases.`,
    );
  }

  const headerRowIndex = findHeaderRow(rows, "Bldg-Unit");
  if (headerRowIndex < 0) {
    throw new EntrataParseError(
      "This file's structure doesn't match an expected Expiring Leases report.",
    );
  }

  const propertyName = extractPropertyName(rows);
  const period = extractPeriod(rows);

  const leases: ExpiringLeaseRow[] = [];
  let inMonthToMonth = false;

  for (let i = headerRowIndex + 1; i < rows.length; i += 1) {
    const row = rows[i];
    if (!row) continue;
    if (isTotalRow(row)) continue;

    if (isSectionLabel(row)) {
      const label = asString(row[COL.bldgUnit] ?? null)?.trim() ?? "";
      inMonthToMonth = /^month\s*to\s*month$/i.test(label);
      continue;
    }

    if (!isUnitDataRow(row)) continue;

    const unitNumber = String(row[COL.bldgUnit] ?? "").trim();
    const tenantName = asString(row[COL.resident] ?? null)?.trim() ?? "";
    const leaseEndSerial = asNumber(row[COL.leaseEnd] ?? null);
    const moveOutSerial = asNumber(row[COL.moveOut] ?? null);

    leases.push({
      unitNumber,
      tenantName,
      leaseEnd: leaseEndSerial !== null ? excelSerialToISO(leaseEndSerial) : null,
      moveOut: moveOutSerial !== null ? excelSerialToISO(moveOutSerial) : null,
      isMonthToMonth: inMonthToMonth || leaseEndSerial === null,
    });
  }

  return { propertyName, period, leases };
}
