import type { Lease, Unit, UnitStatus } from "@/types/portfolio";
import { excelSerialToISO, toISODate } from "./shared/excelDates";
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
import { extractPeriod, extractPropertyName, slugify } from "./shared/metadata";
import type {
  EntrataUnitStatus,
  RentRollBalance,
  RentRollResult,
} from "./shared/types";

const STATUS_MAP: Record<EntrataUnitStatus, UnitStatus> = {
  "Occupied No Notice": "occupied",
  "Notice Rented": "notice",
  "Notice Unrented": "notice",
  "Vacant Rented Ready": "vacant-ready",
  "Vacant Unrented Ready": "vacant-ready",
  "Vacant Unrented Not Ready": "vacant-not-ready",
};

// Resolved column indexes for one parse. Entrata exports two variants of the
// Rent Roll: "w/ Lease Charges" includes Ledger + Charge Code + multi-row
// charge breakdowns; the plain "Rent Roll" omits those and puts each unit's
// full scheduled rent on the main row. Resolving by header text instead of
// hard-coded position keeps both shapes working.
interface RentRollColumns {
  bldgUnit: number;
  unitType: number;
  sqft: number;
  unitStatus: number;
  resident: number;
  moveIn: number;
  leaseStart: number;
  leaseEnd: number;
  expectedMoveOut: number;
  marketRent: number;
  scheduledCharges: number;
  balance: number;
  depositHeld: number;
  // Only present in the "w/ Lease Charges" variant. When null, no extras or
  // Charge Total: rows exist for the parser to consume.
  chargeCode: number | null;
}

function resolveColumns(header: Row): RentRollColumns {
  const find = (name: string): number => {
    const target = name.toLowerCase();
    for (let i = 0; i < header.length; i += 1) {
      if (asString(header[i] ?? null)?.trim().toLowerCase() === target) return i;
    }
    return -1;
  };
  const required = (name: string): number => {
    const idx = find(name);
    if (idx < 0) {
      throw new EntrataParseError(
        `Rent Roll is missing the "${name}" column — was the export modified?`,
      );
    }
    return idx;
  };
  const chargeCode = find("Charge Code");
  return {
    bldgUnit: required("Bldg-Unit"),
    unitType: required("Unit Type"),
    sqft: required("SQFT"),
    unitStatus: required("Unit Status"),
    resident: required("Resident"),
    moveIn: required("Move-In"),
    leaseStart: required("Lease Start"),
    leaseEnd: required("Lease End"),
    expectedMoveOut: required("Expected Move-Out"),
    marketRent: required("Market Rent"),
    scheduledCharges: required("Scheduled Charges"),
    balance: required("Balance"),
    depositHeld: required("Deposit Held"),
    chargeCode: chargeCode >= 0 ? chargeCode : null,
  };
}

const VACANT_RESIDENT_MARKER = /^--\s*vacant\s*--$/i;
// Section headers that signal end-of-units. The Total: marker matches both
// the bare "Total:" (w/ Lease Charges variant) and "<Property Name> Total:"
// (plain Rent Roll variant) — the colon at end is the reliable signal.
const STOP_PREFIXES = /^(status summary|future resident details|charge code summary|total\b)/i;
const STOP_TOTAL_SUFFIX = /\btotal:\s*$/i;

function isStopRow(row: Row): boolean {
  for (let i = 0; i < Math.min(row.length, 4); i += 1) {
    const cell = asString(row[i] ?? null)?.trim();
    if (!cell) continue;
    if (STOP_PREFIXES.test(cell)) return true;
    if (STOP_TOTAL_SUFFIX.test(cell)) return true;
  }
  return false;
}

function isUnitIdentifier(v: unknown): boolean {
  if (typeof v === "number") return true;
  if (typeof v !== "string") return false;
  const trimmed = v.trim();
  if (trimmed === "" || trimmed === "-") return false;
  // Accept "101", "B-204", "Main", etc — anything alphanumeric without
  // looking like a section label.
  if (STOP_PREFIXES.test(trimmed) || STOP_TOTAL_SUFFIX.test(trimmed)) return false;
  return /^[A-Za-z0-9][A-Za-z0-9\-_. ]*$/.test(trimmed);
}

interface ChargeRow {
  chargeCode: string;
  scheduled: number;
}

interface UnitGroup {
  main: Row;
  extras: ChargeRow[];
  totalRow: Row | null;
}

function bedsForUnitType(code: string): { bedrooms: number; bathrooms: number } {
  // Entrata's unit-type codes encode bed count by convention. The Lower
  // Burnside set:  *EFF*/*ERR* = studio; *A* = 1 BR; *B* = 2 BR; *C* = 3 BR.
  // Falls back to 1/1 for anything unrecognised.
  const u = code.toUpperCase();
  if (/EFF|ERR|STUDIO/.test(u)) return { bedrooms: 0, bathrooms: 1 };
  if (/^[A-Z]+A\d/.test(u) || /A\d+$/.test(u)) return { bedrooms: 1, bathrooms: 1 };
  if (/^[A-Z]+B\d/.test(u) || /B\d+$/.test(u)) return { bedrooms: 2, bathrooms: 1 };
  if (/^[A-Z]+C\d/.test(u) || /C\d+$/.test(u)) return { bedrooms: 3, bathrooms: 2 };
  return { bedrooms: 1, bathrooms: 1 };
}

function groupRows(rows: Row[], headerRowIndex: number, cols: RentRollColumns): UnitGroup[] {
  const groups: UnitGroup[] = [];
  let current: UnitGroup | null = null;

  for (let i = headerRowIndex + 1; i < rows.length; i += 1) {
    const row = rows[i];
    if (!row) continue;
    if (isStopRow(row)) break;

    const idCell = row[cols.bldgUnit];

    if (isUnitIdentifier(idCell)) {
      // Start a new unit group.
      current = { main: row, extras: [], totalRow: null };
      groups.push(current);
      continue;
    }

    if (!current) continue; // stray row before any unit; skip.
    if (cols.chargeCode === null) continue; // no charge breakdown in this variant.

    const chargeCode = asString(row[cols.chargeCode] ?? null)?.trim() ?? "";
    if (chargeCode === "Charge Total:") {
      current.totalRow = row;
      continue;
    }

    // Additional charge line (parking, pet rent, etc.). The Ledger column is
    // null and Charge Code holds the line name.
    const scheduled = asNumber(row[cols.scheduledCharges] ?? null);
    if (chargeCode && scheduled !== null) {
      current.extras.push({ chargeCode, scheduled });
    }
  }

  return groups;
}

function buildLease(main: Row, monthlyRent: number, cols: RentRollColumns): Lease | undefined {
  const tenant = asString(main[cols.resident] ?? null)?.trim();
  if (!tenant || VACANT_RESIDENT_MARKER.test(tenant)) return undefined;

  const startSerial = asNumber(main[cols.leaseStart] ?? null);
  const endSerial = asNumber(main[cols.leaseEnd] ?? null);
  const expectedMoveOutSerial = asNumber(main[cols.expectedMoveOut] ?? null);

  return {
    tenantName: tenant,
    startDate: startSerial !== null ? excelSerialToISO(startSerial) : "",
    endDate: endSerial !== null ? excelSerialToISO(endSerial) : null,
    monthlyRent,
    securityDeposit: asNumber(main[cols.depositHeld] ?? null) ?? 0,
    expectedMoveOut: expectedMoveOutSerial !== null ? excelSerialToISO(expectedMoveOutSerial) : null,
  };
}

function buildUnit(group: UnitGroup, propertySlug: string, cols: RentRollColumns): Unit | null {
  const { main, extras, totalRow } = group;
  const unitNumber = String(main[cols.bldgUnit] ?? "").trim();
  if (!unitNumber) return null;

  const unitType = asString(main[cols.unitType] ?? null)?.trim() ?? "";
  const sqft = asNumber(main[cols.sqft] ?? null) ?? 0;
  const statusRaw = asString(main[cols.unitStatus] ?? null)?.trim() ?? "";
  const mapped = STATUS_MAP[statusRaw as EntrataUnitStatus];
  const status: UnitStatus = mapped ?? "vacant-not-ready";

  const marketRent = asNumber(main[cols.marketRent] ?? null) ?? 0;
  const mainScheduled = asNumber(main[cols.scheduledCharges] ?? null) ?? 0;
  const totalScheduled = totalRow ? asNumber(totalRow[cols.scheduledCharges] ?? null) : null;
  // Prefer the "Charge Total:" row when present (it sums the unit's lines);
  // fall back to summing main + extras ourselves. In the plain Rent Roll
  // variant there are no extras — main scheduled IS the per-unit total.
  const scheduledRent = totalScheduled !== null
    ? totalScheduled
    : mainScheduled + extras.reduce((s, e) => s + e.scheduled, 0);

  const beds = bedsForUnitType(unitType);
  // monthlyRent must equal the unit's full scheduled rent (Charge Total: row,
  // including parking and other recurring charges) so the rent-collection
  // metric in metrics.ts sums the same numbers a property manager would.
  const lease = buildLease(main, scheduledRent, cols);

  // Expected move-out can land on the unit even when the lease block is
  // suppressed (vacant unit with prior expected-out date); we don't surface
  // it for vacant units.
  return {
    id: `${propertySlug}-${unitNumber}`,
    unitNumber,
    unitType,
    bedrooms: beds.bedrooms,
    bathrooms: beds.bathrooms,
    squareFeet: sqft,
    status,
    marketRent,
    scheduledRent,
    currentLease: lease,
  };
}

export function parseRentRoll(input: Bytes): RentRollResult {
  const wb = readWorkbook(input);
  const rows = firstSheetRows(wb);

  const reportType = detectReportType(rows);
  if (reportType !== "rentRoll" && reportType !== "unknown") {
    throw new EntrataParseError(
      `This looks like a different report (${reportType}), not a Rent Roll. Try the matching slot.`,
    );
  }

  const headerRowIndex = findHeaderRow(rows, "Bldg-Unit");
  if (headerRowIndex < 0) {
    throw new EntrataParseError(
      "This file's structure doesn't match an expected Rent Roll. Was it modified after export?",
    );
  }

  const propertyName = extractPropertyName(rows);
  const period = extractPeriod(rows);
  const propertySlug = slugify(propertyName) || "uploaded";

  const cols = resolveColumns(rows[headerRowIndex] ?? []);
  const groups = groupRows(rows, headerRowIndex, cols);
  const units: Unit[] = [];
  const balances: RentRollBalance[] = [];
  for (const g of groups) {
    const unit = buildUnit(g, propertySlug, cols);
    if (!unit) continue;
    units.push(unit);

    // Capture positive balance for AR approximation. Skip vacant units (no
    // tenant) and any non-positive balance (credit or zero).
    const tenant = unit.currentLease?.tenantName;
    if (!tenant) continue;
    const balance = asNumber(g.main[cols.balance] ?? null);
    if (balance !== null && balance > 0) {
      balances.push({ unitNumber: unit.unitNumber, tenantName: tenant, balance });
    }
  }

  // Stable order matches sample data convention (sorted by unit number).
  units.sort((a, b) => a.unitNumber.localeCompare(b.unitNumber, undefined, { numeric: true }));

  return { propertyName, period, units, balances };
}

// Re-exported for use by the public adapter and the AR parser.
export { excelSerialToISO, toISODate };
