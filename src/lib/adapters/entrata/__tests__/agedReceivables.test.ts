import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { parseAgedReceivables } from "../agedReceivables";

const FIXTURE = path.resolve(
  process.cwd(),
  "test-fixtures/entrata/aged-receivables.xlsx",
);

function load() {
  const buf = readFileSync(FIXTURE);
  return parseAgedReceivables(buf);
}

describe("parseAgedReceivables — Lower Burnside", () => {
  it("extracts property name (first of the comma-joined names)", () => {
    const r = load();
    expect(r.propertyName).toBe("The Lower Burnside Lofts");
  });

  it("returns one balance — Westphal at unit 507, $453.60 in 0-30 bucket", () => {
    const r = load();
    expect(r.balances.length).toBe(1);
    const w = r.balances[0];
    expect(w.unitNumber).toBe("507");
    expect(w.tenantName).toBe("Westphal, Theresa");
    expect(w.totalOwed).toBeCloseTo(453.6, 2);
    expect(w.agingBuckets.days0to30).toBeCloseTo(453.6, 2);
    expect(w.agingBuckets.days31to60).toBe(0);
    expect(w.agingBuckets.days61to90).toBe(0);
    expect(w.agingBuckets.daysOver90).toBe(0);
  });

  it("does not include the Total: footer row", () => {
    const r = load();
    for (const b of r.balances) {
      expect(b.tenantName).not.toMatch(/^total/i);
    }
  });
});
