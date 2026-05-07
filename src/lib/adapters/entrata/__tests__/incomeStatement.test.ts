import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { parseIncomeStatement } from "../incomeStatement";

const FIXTURE = path.resolve(
  process.cwd(),
  "test-fixtures/entrata/income-statement.xlsx",
);

function load() {
  const buf = readFileSync(FIXTURE);
  return parseIncomeStatement(buf);
}

describe("parseIncomeStatement — Lower Burnside", () => {
  it("extracts property name and period", () => {
    const r = load();
    expect(r.propertyName).toBe("The Lower Burnside Lofts");
    expect(r.period).toBe("May 2025 - Apr 2026");
  });

  it("returns 6 monthly financials (Nov 2025 – Apr 2026, zero months dropped)", () => {
    const r = load();
    expect(r.financials.length).toBe(6);
    expect(r.financials[0].month).toBe("2025-11-01");
    expect(r.financials.at(-1)!.month).toBe("2026-04-01");
  });

  it("April 2026 — Income 90,429.98, NOI 49,758, Maintenance 6,350.14", () => {
    const r = load();
    const apr = r.financials.find((m) => m.month === "2026-04-01");
    expect(apr).toBeDefined();
    expect(apr!.income).toBeCloseTo(90429.98, 2);
    expect(apr!.noi).toBeCloseTo(49758.0, 2);
    expect(apr!.maintenanceSpend).toBeCloseTo(6350.14, 2);
  });

  it("April 2026 — operating expenses, non-op expenses, net profit", () => {
    const r = load();
    const apr = r.financials.find((m) => m.month === "2026-04-01")!;
    expect(apr.operatingExpenses).toBeCloseTo(40671.98, 2);
    expect(apr.nonOperatingExpenses).toBeCloseTo(33346.74, 2);
    expect(apr.netProfit).toBeCloseTo(16411.26, 2);
  });

  it("uses Entrata's pre-computed NOI rather than re-deriving it", () => {
    const r = load();
    const apr = r.financials.find((m) => m.month === "2026-04-01")!;
    // Entrata's NOI comes from row 143 directly, not from
    // (income - operatingExpenses), which equals 49758.0 here either way.
    expect(apr.noi).toBeCloseTo(49758.0, 2);
  });

  it("matches sample.ts values for Jan–Apr 2026 (the months sample covers)", () => {
    const r = load();
    const byMonth = Object.fromEntries(r.financials.map((f) => [f.month, f]));
    expect(byMonth["2026-01-01"].income).toBeCloseTo(84418.6, 2);
    expect(byMonth["2026-02-01"].noi).toBeCloseTo(49663.7, 2);
    expect(byMonth["2026-03-01"].maintenanceSpend).toBeCloseTo(6373.95, 2);
  });

  // EGI inputs feed the trailing-12 OpEx % tile. The parser must populate
  // grossPotentialRent / vacancyLoss / concessions on every month (signed as
  // exported), or omit all three uniformly — partial population would make
  // the metric look broken on edge months.
  it("populates EGI-input fields on every month", () => {
    const r = load();
    for (const m of r.financials) {
      expect(m.grossPotentialRent).toBeDefined();
      expect(m.vacancyLoss).toBeDefined();
      expect(m.concessions).toBeDefined();
    }
  });

  it("April 2026 — GPR 83,861.27, Vacancy 0, Concessions −6,028", () => {
    const r = load();
    const apr = r.financials.find((m) => m.month === "2026-04-01")!;
    expect(apr.grossPotentialRent).toBeCloseTo(83861.27, 2);
    expect(apr.vacancyLoss).toBeCloseTo(0, 2);
    expect(apr.concessions).toBeCloseTo(-6028, 2);
  });

  it("trailing-12 EGI = GPR + signed Vacancy + signed Concessions = $1,759,601.20", () => {
    const r = load();
    const sum = (k: "grossPotentialRent" | "vacancyLoss" | "concessions") =>
      r.financials.reduce((s, m) => s + (m[k] ?? 0), 0);
    const egi = sum("grossPotentialRent") + sum("vacancyLoss") + sum("concessions");
    expect(egi).toBeCloseTo(1759601.2, 1);
  });
});
