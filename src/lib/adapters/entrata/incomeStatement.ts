import type { MonthlyFinancial } from "@/types/portfolio";
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
import type { IncomeStatementResult } from "./shared/types";

// Column 0 holds GL account codes; column 1 holds account names. The next 12
// columns are individual months. Subtotal rows have a null Account and an
// Account Name matching one of the labels below.
const SUBTOTAL_LABELS = {
  income: "Income",
  operatingExpenses: "Operating Expenses",
  noi: "Net Operating Income",
  nonOperatingExpenses: "Non Operating Expenses",
  netProfit: "Net Profit (Loss)",
  maintenance: "Repair and Maintenance",
} as const;

const MONTH_LOOKUP: Record<string, number> = {
  jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6,
  jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12,
};

function parseMonthHeader(label: string): string | null {
  const m = label.match(/^([A-Za-z]+)\s+(\d{4})$/);
  if (!m) return null;
  const month = MONTH_LOOKUP[m[1].slice(0, 3).toLowerCase()];
  if (!month) return null;
  return `${m[2]}-${String(month).padStart(2, "0")}-01`;
}

interface MonthColumn {
  index: number;
  monthISO: string;
}

function discoverMonthColumns(headerRow: Row): MonthColumn[] {
  const out: MonthColumn[] = [];
  for (let i = 2; i < headerRow.length; i += 1) {
    const cell = asString(headerRow[i] ?? null)?.trim();
    if (!cell) continue;
    if (cell === "Total" || cell === "YTD") break;
    const iso = parseMonthHeader(cell);
    if (iso) out.push({ index: i, monthISO: iso });
  }
  return out;
}

// Locate a subtotal row: Account column is null, Account Name matches the
// requested label exactly. We scan the entire body so order doesn't matter.
function findSubtotalRow(rows: Row[], headerRowIndex: number, label: string): Row | null {
  for (let i = headerRowIndex + 1; i < rows.length; i += 1) {
    const row = rows[i];
    if (!row) continue;
    const accountCell = row[0];
    const nameCell = asString(row[1] ?? null)?.trim();
    // A subtotal line has Account empty AND name matching the label.
    if ((accountCell === null || accountCell === "") && nameCell === label) {
      return row;
    }
  }
  return null;
}

// Locate a GL account line by Account Name (column 1). Unlike subtotals these
// rows DO have an Account code in column 0. Used for EGI-input lines that
// don't appear as subtotals (Gross Potential Rent, Vacancy Loss,
// Less: Concessions).
function findAccountRow(rows: Row[], headerRowIndex: number, label: string): Row | null {
  for (let i = headerRowIndex + 1; i < rows.length; i += 1) {
    const row = rows[i];
    if (!row) continue;
    const accountCell = row[0];
    const nameCell = asString(row[1] ?? null)?.trim();
    if (accountCell !== null && accountCell !== "" && nameCell === label) {
      return row;
    }
  }
  return null;
}

function getNumber(row: Row, col: number): number {
  return asNumber(row[col] ?? null) ?? 0;
}

export function parseIncomeStatement(input: Bytes): IncomeStatementResult {
  const wb = readWorkbook(input);
  const rows = firstSheetRows(wb);

  const reportType = detectReportType(rows);
  if (reportType !== "incomeStatement" && reportType !== "unknown") {
    throw new EntrataParseError(
      `This looks like a different report (${reportType}), not an Income Statement.`,
    );
  }

  const headerRowIndex = findHeaderRow(rows, "Account");
  if (headerRowIndex < 0) {
    throw new EntrataParseError(
      "This file's structure doesn't match an expected Income Statement. Was it modified after export?",
    );
  }

  const headerRow = rows[headerRowIndex] ?? [];
  const monthColumns = discoverMonthColumns(headerRow);
  if (monthColumns.length === 0) {
    throw new EntrataParseError(
      "Couldn't find any month columns in this Income Statement.",
    );
  }

  const incomeRow = findSubtotalRow(rows, headerRowIndex, SUBTOTAL_LABELS.income);
  const opexRow = findSubtotalRow(rows, headerRowIndex, SUBTOTAL_LABELS.operatingExpenses);
  const noiRow = findSubtotalRow(rows, headerRowIndex, SUBTOTAL_LABELS.noi);
  const nonOpExRow = findSubtotalRow(rows, headerRowIndex, SUBTOTAL_LABELS.nonOperatingExpenses);
  const netProfitRow = findSubtotalRow(rows, headerRowIndex, SUBTOTAL_LABELS.netProfit);
  const maintRow = findSubtotalRow(rows, headerRowIndex, SUBTOTAL_LABELS.maintenance);

  // EGI inputs — individual GL account lines, not subtotals. Used by the
  // trailing-12 OpEx % tile. All three rows must be present for EGI to be
  // computable; if any are missing the per-month fields stay undefined.
  const gprRow = findAccountRow(rows, headerRowIndex, "Gross Potential Rent");
  const vacancyRow = findAccountRow(rows, headerRowIndex, "Vacancy Loss");
  const concessionsRow = findAccountRow(rows, headerRowIndex, "Less: Concessions");
  const hasEgiInputs = !!(gprRow && vacancyRow && concessionsRow);

  if (!incomeRow || !opexRow || !noiRow || !netProfitRow) {
    throw new EntrataParseError(
      "This Income Statement is missing required subtotal rows (Income, Operating Expenses, NOI, Net Profit).",
    );
  }

  const financials: MonthlyFinancial[] = [];
  for (const { index, monthISO } of monthColumns) {
    const income = getNumber(incomeRow, index);
    const operatingExpenses = getNumber(opexRow, index);
    const noi = getNumber(noiRow, index);
    const nonOperatingExpenses = nonOpExRow ? getNumber(nonOpExRow, index) : 0;
    const netProfit = getNumber(netProfitRow, index);
    const maintenanceSpend = maintRow ? getNumber(maintRow, index) : 0;
    const grossPotentialRent = hasEgiInputs ? getNumber(gprRow!, index) : undefined;
    const vacancyLoss = hasEgiInputs ? getNumber(vacancyRow!, index) : undefined;
    const concessions = hasEgiInputs ? getNumber(concessionsRow!, index) : undefined;

    // Pre-acquisition / pre-data months show all zeros — drop them so the
    // dashboard doesn't render flat lines. EGI-input fields are also zero
    // in those months, so the trailing-12 sum is unaffected by the drop.
    if (
      income === 0 &&
      operatingExpenses === 0 &&
      noi === 0 &&
      nonOperatingExpenses === 0 &&
      netProfit === 0 &&
      maintenanceSpend === 0 &&
      (grossPotentialRent ?? 0) === 0 &&
      (vacancyLoss ?? 0) === 0 &&
      (concessions ?? 0) === 0
    ) {
      continue;
    }

    financials.push({
      month: monthISO,
      income,
      operatingExpenses,
      noi,
      nonOperatingExpenses,
      netProfit,
      maintenanceSpend,
      ...(hasEgiInputs && {
        grossPotentialRent,
        vacancyLoss,
        concessions,
      }),
    });
  }

  financials.sort((a, b) => a.month.localeCompare(b.month));

  return {
    propertyName: extractPropertyName(rows),
    period: extractPeriod(rows),
    financials,
  };
}
