import { addDays, isAfter, isBefore, parseISO } from "date-fns";
import type { MonthlyFinancial, Property, UnitStatus } from "@/types/portfolio";

export interface OccupancyResult {
  occupied: number;
  total: number;
  percent: number;
}

export function occupancyRate(p: Property): OccupancyResult {
  if (p.propertyType === "single-family") {
    const occupied = p.units[0]?.status === "occupied" ? 1 : 0;
    return { occupied, total: 1, percent: occupied * 100 };
  }
  const occupied = p.units.filter((u) => u.status === "occupied").length;
  const total = p.units.length;
  return { occupied, total, percent: total === 0 ? 0 : (occupied / total) * 100 };
}

export function statusBreakdown(p: Property): Record<UnitStatus, number> {
  const out: Record<UnitStatus, number> = {
    occupied: 0,
    notice: 0,
    "vacant-ready": 0,
    "vacant-not-ready": 0,
  };
  for (const u of p.units) out[u.status] += 1;
  return out;
}

export function rentExpectedThisMonth(p: Property): number {
  return p.units.reduce((sum, u) => {
    if ((u.status === "occupied" || u.status === "notice") && u.currentLease) {
      return sum + u.currentLease.monthlyRent;
    }
    return sum;
  }, 0);
}

export function rentCollectedThisMonth(p: Property): number {
  const expected = rentExpectedThisMonth(p);
  const owed = p.arBalances.reduce((s, b) => s + b.totalOwed, 0);
  return expected - owed;
}

export function rentCollectionPercent(p: Property): number {
  const expected = rentExpectedThisMonth(p);
  if (expected === 0) return 0;
  return (rentCollectedThisMonth(p) / expected) * 100;
}

export type DelinquencyBucketLabel = "0-30" | "31-60" | "61-90" | "90+" | "none";

export interface DelinquencyResult {
  totalOwed: number;
  tenantCount: number;
  oldestBucket: DelinquencyBucketLabel;
}

const BUCKET_RANK: Record<DelinquencyBucketLabel, number> = {
  none: 0,
  "0-30": 1,
  "31-60": 2,
  "61-90": 3,
  "90+": 4,
};

export function delinquencies(p: Property): DelinquencyResult {
  const totalOwed = p.arBalances.reduce((s, b) => s + b.totalOwed, 0);
  const tenantCount = p.arBalances.length;

  let oldest: DelinquencyBucketLabel = "none";
  const promote = (next: DelinquencyBucketLabel) => {
    if (BUCKET_RANK[next] > BUCKET_RANK[oldest]) oldest = next;
  };
  for (const b of p.arBalances) {
    if (b.agingBuckets.daysOver90 > 0) promote("90+");
    if (b.agingBuckets.days61to90 > 0) promote("61-90");
    if (b.agingBuckets.days31to60 > 0) promote("31-60");
    if (b.agingBuckets.days0to30 > 0) promote("0-30");
  }

  return { totalOwed, tenantCount, oldestBucket: oldest };
}

export interface LeaseExpiration {
  tenant: string;
  unitNumber: string;
  endDate: string;
  rent: number;
}

export function leaseExpirations(p: Property, days = 90): LeaseExpiration[] {
  const start = parseISO(p.reportingPeriod);
  const end = addDays(start, days);
  const out: LeaseExpiration[] = [];
  for (const u of p.units) {
    const lease = u.currentLease;
    if (!lease || !lease.endDate) continue;
    const ed = parseISO(lease.endDate);
    if (isBefore(ed, start) || isAfter(ed, end)) continue;
    out.push({
      tenant: lease.tenantName,
      unitNumber: u.unitNumber,
      endDate: lease.endDate,
      rent: lease.monthlyRent,
    });
  }
  out.sort((a, b) => a.endDate.localeCompare(b.endDate));
  return out;
}

export interface OpenWorkOrdersResult {
  total: number;
  urgent: number;
}

export function openWorkOrders(p: Property): OpenWorkOrdersResult | null {
  if (p.workOrders.length === 0) return null;
  const open = p.workOrders.filter((w) => w.status !== "closed");
  const urgent = open.filter(
    (w) => w.priority === "high" || w.priority === "emergency"
  ).length;
  return { total: open.length, urgent };
}

function rowForReportingPeriod(p: Property) {
  return p.monthlyFinancials.find((m) => m.month === p.reportingPeriod);
}

export function incomeThisMonth(p: Property): number {
  return rowForReportingPeriod(p)?.income ?? 0;
}

export function operatingExpensesThisMonth(p: Property): number {
  return rowForReportingPeriod(p)?.operatingExpenses ?? 0;
}

export function noiThisMonth(p: Property): number {
  return rowForReportingPeriod(p)?.noi ?? 0;
}

export function maintenanceSpendThisMonth(p: Property): number {
  return rowForReportingPeriod(p)?.maintenanceSpend ?? 0;
}

export function netCashFlowThisMonth(p: Property): number {
  const row = rowForReportingPeriod(p);
  if (!row) return 0;
  return row.noi - row.nonOperatingExpenses;
}

export interface MomDelta {
  current: number;
  prior: number;
  priorMonth: string;
}

export function momDelta(
  p: Property,
  extract: (m: MonthlyFinancial) => number
): MomDelta | null {
  const sorted = [...p.monthlyFinancials].sort((a, b) =>
    a.month.localeCompare(b.month)
  );
  const idx = sorted.findIndex((m) => m.month === p.reportingPeriod);
  if (idx <= 0) return null;
  const cur = sorted[idx];
  const prev = sorted[idx - 1];
  if (!cur || !prev) return null;
  return {
    current: extract(cur),
    prior: extract(prev),
    priorMonth: prev.month,
  };
}

export function incomeDelta(p: Property): MomDelta | null {
  return momDelta(p, (m) => m.income);
}

export function opexDelta(p: Property): MomDelta | null {
  return momDelta(p, (m) => m.operatingExpenses);
}

export function noiDelta(p: Property): MomDelta | null {
  return momDelta(p, (m) => m.noi);
}

export function cashFlowDelta(p: Property): MomDelta | null {
  return momDelta(p, (m) => m.noi - m.nonOperatingExpenses);
}

export function maintenanceDelta(p: Property): MomDelta | null {
  return momDelta(p, (m) => m.maintenanceSpend);
}
