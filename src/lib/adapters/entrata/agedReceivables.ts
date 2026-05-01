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
import { extractPeriod, extractPropertyName } from "./shared/metadata";
import type { AgedReceivablesResult } from "./shared/types";

const COL = {
  bldgUnit: 0,
  resident: 1,
  leaseStatus: 2,
  unallocated: 3,
  days0to30: 4,
  days31to60: 5,
  days61to90: 6,
  daysOver90: 7,
  prePayments: 8,
  balance: 9,
  lastDelinquencyNote: 10,
} as const;

function isTotalRow(row: Row): boolean {
  for (let i = 0; i < Math.min(row.length, 4); i += 1) {
    const cell = asString(row[i] ?? null)?.trim();
    if (cell && /^total:?$/i.test(cell)) return true;
  }
  return false;
}

function isDataRow(row: Row): boolean {
  const unit = row[COL.bldgUnit];
  return unit !== null && unit !== undefined && String(unit).trim() !== "";
}

export function parseAgedReceivables(input: Bytes): AgedReceivablesResult {
  const wb = readWorkbook(input);
  const rows = firstSheetRows(wb);

  const reportType = detectReportType(rows);
  if (reportType !== "agedReceivables" && reportType !== "unknown") {
    throw new EntrataParseError(
      `This looks like a different report (${reportType}), not Resident Aged Receivables.`,
    );
  }

  const headerRowIndex = findHeaderRow(rows, "Bldg-Unit");
  if (headerRowIndex < 0) {
    throw new EntrataParseError(
      "This file's structure doesn't match an expected Resident Aged Receivables report.",
    );
  }

  const propertyName = extractPropertyName(rows);
  const period = extractPeriod(rows);

  const balances: AgedReceivablesResult["balances"] = [];
  for (let i = headerRowIndex + 1; i < rows.length; i += 1) {
    const row = rows[i];
    if (!row) continue;
    if (isTotalRow(row)) break;
    if (!isDataRow(row)) continue;

    const unitNumber = String(row[COL.bldgUnit] ?? "").trim();
    const tenantName = asString(row[COL.resident] ?? null)?.trim() ?? "";
    const totalOwed = asNumber(row[COL.balance] ?? null) ?? 0;
    // Skip prepayments and zero balances — only positive balances are
    // delinquencies. Negative totals would otherwise inflate "rent collected"
    // above 100% in the dashboard math.
    if (totalOwed <= 0) continue;
    balances.push({
      unitNumber,
      tenantName,
      totalOwed,
      agingBuckets: {
        days0to30: Math.max(asNumber(row[COL.days0to30] ?? null) ?? 0, 0),
        days31to60: Math.max(asNumber(row[COL.days31to60] ?? null) ?? 0, 0),
        days61to90: Math.max(asNumber(row[COL.days61to90] ?? null) ?? 0, 0),
        daysOver90: Math.max(asNumber(row[COL.daysOver90] ?? null) ?? 0, 0),
      },
    });
  }

  return { propertyName, period, balances };
}
