// composeProperty — assemble parsed report payloads into a Property.
//
// In the Supabase-backed flow each report is parsed at upload time and the
// payload is stored standalone in `reports.parsed_data`. This module is the
// inverse step: read those payloads back and merge them into the normalized
// `Property` the dashboard components consume.
//
// Manual metadata (id, name, ownerName, address.*) ALWAYS wins over anything
// inferred from the parsed reports. Reports only contribute data fields:
// units, monthlyFinancials, arBalances, workOrders — plus the derived
// propertyType and reportingPeriod (which the parser computes from the rent
// roll). This matches the merge precedence documented for saveReport in
// `lib/properties.ts`.
//
// The legacy `parseEntrataReports` orchestrator in `index.ts` now delegates
// to this function so both code paths produce identical Property output.

import type { ARBalance, Property, PropertyType, Unit } from "@/types/portfolio";
import { periodToReportingISO } from "./shared/metadata";
import type {
  AgedReceivablesResult,
  ExpiringLeasesResult,
  IncomeStatementResult,
  RentRollBalance,
  RentRollResult,
} from "./shared/types";

export type ReportType =
  | "rent_roll"
  | "income_statement_t12"
  | "expiring_leases"
  | "aged_receivables"
  | "work_orders";

// Tagged union of parsed report payloads — `parsed_data` from the reports
// table, narrowed by `reportType`.
export type ReportPayload =
  | { reportType: "rent_roll"; data: RentRollResult }
  | { reportType: "income_statement_t12"; data: IncomeStatementResult }
  | { reportType: "expiring_leases"; data: ExpiringLeasesResult }
  | { reportType: "aged_receivables"; data: AgedReceivablesResult }
  | { reportType: "work_orders"; data: unknown };

export interface PropertyMeta {
  id: string;
  name: string;
  ownerName: string;
  address: {
    street: string;
    city: string;
    state: string;
    zip: string;
  };
}

export interface ComposedProperty {
  property: Property;
  warnings: string[];
}

const EMPTY_PROPERTY = (meta: PropertyMeta): Property => ({
  id: meta.id,
  name: meta.name,
  ownerName: meta.ownerName,
  address: meta.address,
  propertyType: "apartment-building",
  reportingPeriod: "",
  units: [],
  arBalances: [],
  workOrders: [],
  monthlyFinancials: [],
});

function inferPropertyType(unitCount: number): PropertyType {
  if (unitCount <= 1) return "single-family";
  if (unitCount <= 4) return "small-multifamily";
  return "apartment-building";
}

function applyExpiringLeases(
  units: Unit[],
  leases: ExpiringLeasesResult["leases"],
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
    if (row.isMonthToMonth && unit.currentLease.endDate === null) continue;
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
  balances: AgedReceivablesResult["balances"],
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

// Approximate AR from the Rent Roll's Balance column when no AR report has
// been uploaded. Positive balance only; bucketed as 0–30 since we lack
// aging info. The dashboard surfaces a notice banner when this fallback
// fires.
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

// Pull the first parsed payload of each known report type, with the precise
// data shape narrowed. The generic Extract pattern stumbled TypeScript here,
// so per-type findRentRoll / findIncomeStatement / etc. cast at the boundary
// instead — boring but unambiguous.
function findRentRoll(reports: ReportPayload[]): RentRollResult | undefined {
  const r = reports.find((r) => r.reportType === "rent_roll");
  return r?.data as RentRollResult | undefined;
}
function findIncomeStatement(reports: ReportPayload[]): IncomeStatementResult | undefined {
  const r = reports.find((r) => r.reportType === "income_statement_t12");
  return r?.data as IncomeStatementResult | undefined;
}
function findExpiringLeases(reports: ReportPayload[]): ExpiringLeasesResult | undefined {
  const r = reports.find((r) => r.reportType === "expiring_leases");
  return r?.data as ExpiringLeasesResult | undefined;
}
function findAgedReceivables(reports: ReportPayload[]): AgedReceivablesResult | undefined {
  const r = reports.find((r) => r.reportType === "aged_receivables");
  return r?.data as AgedReceivablesResult | undefined;
}

// Reconcile property names emitted by each parser. Rent Roll wins; mismatches
// surface as a warning so the user knows which file's name we kept.
function reconcileNames(
  primary: string,
  others: Array<{ source: string; name: string }>,
  warnings: string[],
): string {
  for (const o of others) {
    if (!o.name || o.name === primary) continue;
    warnings.push(
      `Note: ${o.source} references "${o.name}" instead of "${primary}". Using the Rent Roll's name.`,
    );
  }
  return primary;
}

export function composeProperty(
  meta: PropertyMeta,
  reports: ReportPayload[],
): ComposedProperty {
  const warnings: string[] = [];

  const rr = findRentRoll(reports);
  const inc = findIncomeStatement(reports);
  const exp = findExpiringLeases(reports);
  const ar = findAgedReceivables(reports);

  // No rent roll → return a metadata-only Property. Components fall back to
  // their per-tile empty states.
  if (!rr) return { property: EMPTY_PROPERTY(meta), warnings };

  // Defensive copy so applyExpiringLeases doesn't mutate the parsed_data
  // payload still referenced by the reports array.
  let units: Unit[] = rr.units.map((u) => ({
    ...u,
    currentLease: u.currentLease ? { ...u.currentLease } : undefined,
  }));

  if (exp) {
    units = applyExpiringLeases(units, exp.leases, warnings);
  }

  let arBalances: ARBalance[];
  if (ar) {
    arBalances = applyAgedReceivables(units, ar.balances, warnings);
  } else {
    arBalances = approximateBalancesFromRentRoll(units, rr.balances);
    if (arBalances.length > 0) {
      warnings.push(
        "Aged Receivables not uploaded — showing balances from the Rent Roll (all bucketed as 0–30 days).",
      );
    }
  }

  // Manual metadata wins. We use the rent roll's name only if the manual
  // name is empty — same precedence as `saveReportsFor`'s merge logic.
  const inferredName = reconcileNames(
    rr.propertyName,
    [
      { source: "Income Statement", name: inc?.propertyName ?? "" },
      { source: "Expiring Leases", name: exp?.propertyName ?? "" },
      { source: "Aged Receivables", name: ar?.propertyName ?? "" },
    ],
    warnings,
  );

  const property: Property = {
    id: meta.id,
    name: meta.name || inferredName || "Untitled Property",
    ownerName: meta.ownerName,
    address: meta.address,
    propertyType: inferPropertyType(units.length),
    reportingPeriod: periodToReportingISO(rr.period),
    units,
    arBalances,
    workOrders: [],
    monthlyFinancials: inc?.financials ?? [],
  };

  return { property, warnings };
}
