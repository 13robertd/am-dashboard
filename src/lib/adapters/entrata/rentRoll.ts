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
  "Vacant Unrented Ready": "vacant-ready",
  "Vacant Unrented Not Ready": "vacant-not-ready",
};

// Column indexes in the Rent Roll w/ Lease Charges sheet (relative to the
// header row located at parse time). Order is fixed by Entrata.
const COL = {
  bldgUnit: 0,
  unitType: 1,
  sqft: 2,
  unitStatus: 3,
  resident: 4,
  moveIn: 5,
  leaseStart: 6,
  leaseEnd: 7,
  expectedMoveOut: 8,
  marketRent: 9,
  ledger: 10,
  chargeCode: 11,
  scheduledCharges: 12,
  balance: 13,
  depositHeld: 14,
} as const;

const VACANT_RESIDENT_MARKER = /^--\s*vacant\s*--$/i;
const STOP_MARKERS = /^(total|status summary|future resident details|charge code summary)/i;

function isStopRow(row: Row): boolean {
  for (let i = 0; i < Math.min(row.length, 4); i += 1) {
    const cell = asString(row[i] ?? null)?.trim();
    if (cell && STOP_MARKERS.test(cell)) return true;
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
  if (STOP_MARKERS.test(trimmed)) return false;
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

// Entrata residential unit-type codes follow predictable patterns: studios
// (EFF/ERR/STUDIO) or floor-plan letters A/B/C with a digit. Anything else —
// retail/office/storage spaces that occasionally land on the same Rent Roll —
// is treated as commercial and dropped so it doesn't pollute occupancy and
// rent metrics.
function isResidentialUnitType(code: string): boolean {
  const u = code.toUpperCase().trim();
  if (!u) return false;
  if (/EFF|ERR|STUDIO/.test(u)) return true;
  if (/^[A-Z]+[ABC]\d/.test(u)) return true;
  if (/[ABC]\d+$/.test(u)) return true;
  return false;
}

function groupRows(rows: Row[], headerRowIndex: number): UnitGroup[] {
  const groups: UnitGroup[] = [];
  let current: UnitGroup | null = null;

  for (let i = headerRowIndex + 1; i < rows.length; i += 1) {
    const row = rows[i];
    if (!row) continue;
    if (isStopRow(row)) break;

    const idCell = row[COL.bldgUnit];
    const chargeCode = asString(row[COL.chargeCode] ?? null)?.trim() ?? "";

    if (isUnitIdentifier(idCell)) {
      // Start a new unit group.
      current = { main: row, extras: [], totalRow: null };
      groups.push(current);
      continue;
    }

    if (!current) continue; // stray row before any unit; skip.

    if (chargeCode === "Charge Total:") {
      current.totalRow = row;
      continue;
    }

    // Additional charge line (parking, pet rent, etc.). The Ledger column is
    // null and Charge Code holds the line name.
    const scheduled = asNumber(row[COL.scheduledCharges] ?? null);
    if (chargeCode && scheduled !== null) {
      current.extras.push({ chargeCode, scheduled });
    }
  }

  return groups;
}

function buildLease(main: Row, monthlyRent: number): Lease | undefined {
  const tenant = asString(main[COL.resident] ?? null)?.trim();
  if (!tenant || VACANT_RESIDENT_MARKER.test(tenant)) return undefined;

  const startSerial = asNumber(main[COL.leaseStart] ?? null);
  const endSerial = asNumber(main[COL.leaseEnd] ?? null);
  const expectedMoveOutSerial = asNumber(main[COL.expectedMoveOut] ?? null);

  return {
    tenantName: tenant,
    startDate: startSerial !== null ? excelSerialToISO(startSerial) : "",
    endDate: endSerial !== null ? excelSerialToISO(endSerial) : null,
    monthlyRent,
    securityDeposit: asNumber(main[COL.depositHeld] ?? null) ?? 0,
    expectedMoveOut: expectedMoveOutSerial !== null ? excelSerialToISO(expectedMoveOutSerial) : null,
  };
}

function buildUnit(group: UnitGroup, propertySlug: string): Unit | null {
  const { main, extras, totalRow } = group;
  const unitNumber = String(main[COL.bldgUnit] ?? "").trim();
  if (!unitNumber) return null;

  const unitType = asString(main[COL.unitType] ?? null)?.trim() ?? "";
  const sqft = asNumber(main[COL.sqft] ?? null) ?? 0;
  const statusRaw = asString(main[COL.unitStatus] ?? null)?.trim() ?? "";
  const mapped = STATUS_MAP[statusRaw as EntrataUnitStatus];
  const status: UnitStatus = mapped ?? "vacant-not-ready";

  const marketRent = asNumber(main[COL.marketRent] ?? null) ?? 0;
  const mainScheduled = asNumber(main[COL.scheduledCharges] ?? null) ?? 0;
  const totalScheduled = totalRow ? asNumber(totalRow[COL.scheduledCharges] ?? null) : null;
  // Prefer the "Charge Total:" row when present (it sums the unit's lines);
  // fall back to summing main + extras ourselves.
  const scheduledRent = totalScheduled !== null
    ? totalScheduled
    : mainScheduled + extras.reduce((s, e) => s + e.scheduled, 0);

  const beds = bedsForUnitType(unitType);
  // monthlyRent must equal the unit's full scheduled rent (Charge Total: row,
  // including parking and other recurring charges) so the rent-collection
  // metric in metrics.ts sums the same numbers a property manager would.
  const lease = buildLease(main, scheduledRent);

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

  const groups = groupRows(rows, headerRowIndex);
  const units: Unit[] = [];
  const balances: RentRollBalance[] = [];
  for (const g of groups) {
    const unit = buildUnit(g, propertySlug);
    if (!unit) continue;
    if (!isResidentialUnitType(unit.unitType)) continue; // skip commercial spaces
    units.push(unit);

    // Capture positive balance for AR approximation. Skip vacant units (no
    // tenant) and any non-positive balance (credit or zero).
    const tenant = unit.currentLease?.tenantName;
    if (!tenant) continue;
    const balance = asNumber(g.main[COL.balance] ?? null);
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
