import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import type { Property } from "@/types/portfolio";
import { burnside } from "@/data/sample";
import { EntrataParseError, parseEntrataReports } from "..";

const FIXTURE_DIR = path.resolve(process.cwd(), "test-fixtures/entrata");

function loadAll() {
  return {
    rentRoll: readFileSync(path.join(FIXTURE_DIR, "rent-roll.xlsx")),
    incomeStatement: readFileSync(path.join(FIXTURE_DIR, "income-statement.xlsx")),
    expiringLeases: readFileSync(path.join(FIXTURE_DIR, "expiring-leases.xlsx")),
    agedReceivables: readFileSync(path.join(FIXTURE_DIR, "aged-receivables.xlsx")),
  };
}

describe("parseEntrataReports — full integration (Lower Burnside)", () => {
  it("returns a Property assignable to the public type", async () => {
    const r = await parseEntrataReports(loadAll());
    // Structural: TypeScript ensures r.property is a Property at compile time;
    // at runtime, sanity-check the contract's required fields are present.
    const p: Property = r.property;
    expect(p.id).toBe("uploaded-the-lower-burnside-lofts");
    expect(p.name).toBe("The Lower Burnside Lofts");
    expect(p.propertyType).toBe("apartment-building");
    expect(p.reportingPeriod).toBe("2026-04-01");
    expect(Array.isArray(p.units)).toBe(true);
    expect(Array.isArray(p.arBalances)).toBe(true);
    expect(Array.isArray(p.workOrders)).toBe(true);
    expect(Array.isArray(p.monthlyFinancials)).toBe(true);
  });

  it("matches sample.ts on the headline figures the dashboard reads", async () => {
    const r = await parseEntrataReports(loadAll());
    const p = r.property;

    // Same number of units, same status mix.
    expect(p.units.length).toBe(burnside.units.length); // 61
    const counts = { occupied: 0, notice: 0, "vacant-ready": 0, "vacant-not-ready": 0 };
    for (const u of p.units) counts[u.status] += 1;
    expect(counts).toEqual({
      occupied: 54,
      notice: 4,
      "vacant-ready": 1,
      "vacant-not-ready": 2,
    });

    // April financials match the sample's hand-authored values exactly.
    const apr = p.monthlyFinancials.find((m) => m.month === "2026-04-01")!;
    expect(apr.income).toBeCloseTo(90429.98, 2);
    expect(apr.noi).toBeCloseTo(49758.0, 2);
    expect(apr.maintenanceSpend).toBeCloseTo(6350.14, 2);

    // AR matches the sample's single Westphal balance.
    expect(p.arBalances.length).toBe(1);
    expect(p.arBalances[0].totalOwed).toBeCloseTo(453.6, 2);
    expect(p.arBalances[0].agingBuckets.days0to30).toBeCloseTo(453.6, 2);
  });

  it("reportsParsed/reportsMissing tracks the upload set", async () => {
    const r = await parseEntrataReports(loadAll());
    expect(r.reportsParsed.sort()).toEqual([
      "agedReceivables",
      "expiringLeases",
      "incomeStatement",
      "rentRoll",
    ]);
    expect(r.reportsMissing).toEqual(["workOrders"]);
  });

  it("emits no warnings when all property names agree", async () => {
    const r = await parseEntrataReports(loadAll());
    expect(r.warnings).toEqual([]);
  });

  it("AR balances reference unit IDs that exist in units[]", async () => {
    const r = await parseEntrataReports(loadAll());
    const ids = new Set(r.property.units.map((u) => u.id));
    for (const b of r.property.arBalances) {
      expect(ids.has(b.unitId)).toBe(true);
    }
  });

  it("throws EntrataParseError when the Rent Roll is missing", async () => {
    await expect(parseEntrataReports({ incomeStatement: loadAll().incomeStatement })).rejects.toThrow(
      EntrataParseError,
    );
  });

  it("works with only the Rent Roll (graceful degradation)", async () => {
    const r = await parseEntrataReports({ rentRoll: loadAll().rentRoll });
    expect(r.property.units.length).toBe(61);
    expect(r.property.monthlyFinancials).toEqual([]);
    expect(r.reportsMissing.sort()).toEqual([
      "agedReceivables",
      "expiringLeases",
      "incomeStatement",
      "workOrders",
    ]);
  });

  it("approximates AR from the Rent Roll Balance column when no AR uploaded", async () => {
    const r = await parseEntrataReports({ rentRoll: loadAll().rentRoll });
    // The Rent Roll's Balance column tracks current-cycle owed/credit, which
    // differs from the AR report's historical aging. In this fixture, the only
    // positive balance is Robbins at unit 504 ($2,019 — current rent + parking
    // not yet paid). Westphal's old $453.60 delinquency lives only in AR.
    expect(r.property.arBalances.length).toBe(1);
    const b = r.property.arBalances[0];
    expect(b.tenantName).toBe("Robbins, Roxy");
    expect(b.totalOwed).toBeCloseTo(2019, 2);
    expect(b.agingBuckets.days0to30).toBeCloseTo(2019, 2);
    expect(b.agingBuckets.days31to60).toBe(0);
    expect(
      r.warnings.some((w) => w.includes("Aged Receivables not uploaded")),
    ).toBe(true);
  });
});
