import type {
  ARBalance,
  Property,
  PropertyType,
  Unit,
} from "@/types/portfolio";
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
import { periodToReportingISO, slugify } from "./shared/metadata";
import type { EntrataReportType, RentRollBalance } from "./shared/types";

// Public Entrata adapter. The rest of the app sees only this entrypoint and
// the normalised `Property` shape it returns — Entrata-specific structures
// stay sealed behind this folder.

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

function inferPropertyType(unitCount: number): PropertyType {
  if (unitCount <= 1) return "single-family";
  if (unitCount <= 4) return "small-multifamily";
  return "apartment-building";
}

// Reconcile property names across reports. The Rent Roll is authoritative —
// everything else just contributes a warning when it disagrees.
function reconcilePropertyName(
  primary: string,
  others: Array<{ source: string; name: string }>,
  warnings: string[],
): string {
  for (const o of others) {
    if (!o.name) continue;
    if (o.name !== primary) {
      warnings.push(
        `Note: ${o.source} references "${o.name}" instead of "${primary}". Using the Rent Roll's name.`,
      );
    }
  }
  return primary;
}

function applyExpiringLeases(
  units: Unit[],
  leases: ReturnType<typeof parseExpiringLeases>["leases"],
  warnings: string[],
): Unit[] {
  const byNumber = new Map(units.map((u) => [u.unitNumber, u]));
  for (const row of leases) {
    const unit = byNumber.get(row.unitNumber);
    if (!unit) {
      warnings.push(
        `Expiring Leases references unit ${row.unitNumber}, which isn't in the Rent Roll.`,
      );
      continue;
    }
    if (!unit.currentLease) continue; // vacant; skip enrichment.
    if (row.isMonthToMonth && unit.currentLease.endDate === null) {
      // Already null in Rent Roll; nothing to do.
      continue;
    }
    if (row.isMonthToMonth) {
      unit.currentLease.endDate = null;
    } else if (row.leaseEnd && !unit.currentLease.endDate) {
      unit.currentLease.endDate = row.leaseEnd;
    }
  }
  return units;
}

function applyAgedReceivables(
  units: Unit[],
  balances: ReturnType<typeof parseAgedReceivables>["balances"],
  warnings: string[],
): ARBalance[] {
  const byNumber = new Map(units.map((u) => [u.unitNumber, u]));
  const result: ARBalance[] = [];
  for (const b of balances) {
    const unit = byNumber.get(b.unitNumber);
    if (!unit) {
      warnings.push(
        `Aged Receivables references unit ${b.unitNumber}, which isn't in the Rent Roll.`,
      );
      continue;
    }
    result.push({
      unitId: unit.id,
      tenantName: b.tenantName,
      totalOwed: b.totalOwed,
      agingBuckets: b.agingBuckets,
    });
  }
  return result;
}

// Approximate AR balances from the Rent Roll's Balance column when no AR
// report was uploaded. Positive balance = delinquent; bucketed as 0-30 since
// we lack aging info.
function approximateBalancesFromRentRoll(
  units: Unit[],
  rentRollBalances: RentRollBalance[],
): ARBalance[] {
  const byNumber = new Map(units.map((u) => [u.unitNumber, u]));
  const result: ARBalance[] = [];
  for (const b of rentRollBalances) {
    const unit = byNumber.get(b.unitNumber);
    if (!unit) continue;
    result.push({
      unitId: unit.id,
      tenantName: b.tenantName,
      totalOwed: b.balance,
      agingBuckets: {
        days0to30: b.balance,
        days31to60: 0,
        days61to90: 0,
        daysOver90: 0,
      },
    });
  }
  return result;
}

export async function parseEntrataReports(
  files: EntrataUpload,
): Promise<EntrataParseResult> {
  const warnings: string[] = [];
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

  // Rent Roll first — it provides identity (property name, units).
  const rr = parseRentRoll(files.rentRoll);
  let units = rr.units;

  // Income Statement → monthlyFinancials.
  let monthlyFinancials = [] as ReturnType<
    typeof parseIncomeStatement
  >["financials"];
  let incomeName = "";
  if (files.incomeStatement) {
    const inc = parseIncomeStatement(files.incomeStatement);
    monthlyFinancials = inc.financials;
    incomeName = inc.propertyName;
  }

  // Expiring Leases → augment lease data.
  let expiringName = "";
  if (files.expiringLeases) {
    const exp = parseExpiringLeases(files.expiringLeases);
    units = applyExpiringLeases(units, exp.leases, warnings);
    expiringName = exp.propertyName;
  }

  // Aged Receivables → arBalances.
  let arName = "";
  let arBalances: ARBalance[];
  if (files.agedReceivables) {
    const ar = parseAgedReceivables(files.agedReceivables);
    arBalances = applyAgedReceivables(units, ar.balances, warnings);
    arName = ar.propertyName;
  } else {
    arBalances = approximateBalancesFromRentRoll(units, rr.balances);
    if (arBalances.length > 0) {
      warnings.push(
        "Aged Receivables not uploaded — showing balances from the Rent Roll (all bucketed as 0–30 days).",
      );
    }
  }

  const propertyName = reconcilePropertyName(
    rr.propertyName,
    [
      { source: "Income Statement", name: incomeName },
      { source: "Expiring Leases", name: expiringName },
      { source: "Aged Receivables", name: arName },
    ],
    warnings,
  );

  const slug = slugify(propertyName) || "uploaded";
  const property: Property = {
    id: `uploaded-${slug}`,
    name: propertyName || "Uploaded Property",
    ownerName: "",
    address: { street: "", city: "", state: "", zip: "" },
    propertyType: inferPropertyType(units.length),
    reportingPeriod: periodToReportingISO(rr.period),
    units,
    arBalances,
    workOrders: [],
    monthlyFinancials,
  };

  return {
    property,
    warnings,
    reportsParsed: parsed,
    reportsMissing: missing,
  };
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
