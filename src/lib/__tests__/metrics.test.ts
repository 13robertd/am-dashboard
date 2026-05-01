import { describe, expect, it } from "vitest";
import { burnside, maple } from "@/data/sample";
import {
  cashFlowDelta,
  delinquencies,
  incomeDelta,
  leaseExpirations,
  maintenanceDelta,
  momDelta,
  netCashFlowThisMonth,
  noiDelta,
  noiThisMonth,
  occupancyRate,
  openWorkOrders,
  opexDelta,
  rentExpectedThisMonth,
  statusBreakdown,
} from "@/lib/metrics";

describe("metrics — Lower Burnside Lofts (multifamily)", () => {
  it("delinquencies sum to the single Westphal balance", () => {
    const d = delinquencies(burnside);
    expect(d.totalOwed).toBeCloseTo(453.6, 2);
    expect(d.tenantCount).toBe(1);
    expect(d.oldestBucket).toBe("0-30");
  });

  it("NOI for the reporting period matches the income statement", () => {
    expect(noiThisMonth(burnside)).toBeCloseTo(49758.0, 2);
  });

  it("net cash flow = NOI − non-operating expenses", () => {
    expect(netCashFlowThisMonth(burnside)).toBeCloseTo(16411.26, 2);
  });

  it("physical occupancy is 54 of 61 (88.5%)", () => {
    const o = occupancyRate(burnside);
    expect(o.occupied).toBe(54);
    expect(o.total).toBe(61);
    expect(o.percent).toBeCloseTo(88.5246, 2);
  });

  it("status breakdown matches spec: 54 occ / 4 notice / 1 ready / 2 not-ready", () => {
    expect(statusBreakdown(burnside)).toEqual({
      occupied: 54,
      notice: 4,
      "vacant-ready": 1,
      "vacant-not-ready": 2,
    });
  });

  // Default window is 90 days — captures the 6 hand-authored anchor leases
  // (102, 207, 208, 308, 311, 502) and excludes all filler (generated to
  // end 2026-07 or later).
  it("lease expirations (default 90 days) returns the 6 anchor leases", () => {
    const exp = leaseExpirations(burnside);
    expect(exp.length).toBe(6);
    const units = exp.map((e) => e.unitNumber).sort();
    expect(units).toEqual(["102", "207", "208", "308", "311", "502"]);
  });

  it("rent expected this month sums leased units' monthlyRent", () => {
    const expected = rentExpectedThisMonth(burnside);
    // 58 leased units, scheduled rents in the $1.2K–$1.95K range → ~$80–90K
    expect(expected).toBeGreaterThan(80000);
    expect(expected).toBeLessThan(95000);
  });

  it("openWorkOrders returns null when sample has none (placeholder UI cue)", () => {
    expect(openWorkOrders(burnside)).toBeNull();
  });
});

describe("MoM deltas — Burnside (April vs March 2026)", () => {
  it("noiDelta: 49758 vs 48598.57 → ~+2.4%", () => {
    const d = noiDelta(burnside);
    expect(d).not.toBeNull();
    expect(d!.current).toBeCloseTo(49758.0, 2);
    expect(d!.prior).toBeCloseTo(48598.57, 2);
    expect(d!.priorMonth).toBe("2026-03-01");
    const pct = ((d!.current - d!.prior) / Math.abs(d!.prior)) * 100;
    expect(pct).toBeCloseTo(2.385, 1);
  });

  it("incomeDelta: 90429.98 vs 90058.92 → flat (~+0.4%, under 0.5%)", () => {
    const d = incomeDelta(burnside);
    const pct = ((d!.current - d!.prior) / Math.abs(d!.prior)) * 100;
    expect(Math.abs(pct)).toBeLessThan(0.5);
  });

  it("opexDelta: 40671.98 vs 41460.35 → ~-1.9%", () => {
    const d = opexDelta(burnside);
    const pct = ((d!.current - d!.prior) / Math.abs(d!.prior)) * 100;
    expect(pct).toBeCloseTo(-1.901, 1);
  });

  it("cashFlowDelta: +16411.26 vs -3054.01 → strongly positive (>100%)", () => {
    const d = cashFlowDelta(burnside);
    expect(d!.current).toBeCloseTo(16411.26, 2);
    expect(d!.prior).toBeCloseTo(-3054.01, 2);
    const pct = ((d!.current - d!.prior) / Math.abs(d!.prior)) * 100;
    expect(pct).toBeGreaterThan(100);
  });

  it("maintenanceDelta: 6350.14 vs 6373.95 → flat (under 0.5%)", () => {
    const d = maintenanceDelta(burnside);
    const pct = ((d!.current - d!.prior) / Math.abs(d!.prior)) * 100;
    expect(Math.abs(pct)).toBeLessThan(0.5);
  });

  it("momDelta returns null for January (no prior month)", () => {
    const janOnly = { ...burnside, reportingPeriod: "2026-01-01" };
    expect(momDelta(janOnly, (m) => m.income)).toBeNull();
  });
});

describe("metrics — 123 Maple Street (SFR)", () => {
  it("SFR occupancy is binary 1/1 = 100%", () => {
    const o = occupancyRate(maple);
    expect(o.occupied).toBe(1);
    expect(o.total).toBe(1);
    expect(o.percent).toBe(100);
  });

  it("SFR April NOI = $1,850 and cash flow = $650", () => {
    expect(noiThisMonth(maple)).toBe(1850);
    expect(netCashFlowThisMonth(maple)).toBe(650);
  });
});
