import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { parseExpiringLeases } from "../expiringLeases";

const FIXTURE = path.resolve(
  process.cwd(),
  "test-fixtures/entrata/expiring-leases.xlsx",
);

function load() {
  const buf = readFileSync(FIXTURE);
  return parseExpiringLeases(buf);
}

describe("parseExpiringLeases — Lower Burnside", () => {
  it("extracts property name and date-range period", () => {
    const r = load();
    expect(r.propertyName).toBe("The Lower Burnside Lofts");
    expect(r.period).toBe("04/01/2026 - 04/30/2026");
  });

  it("returns 14 leases total (6 in APR 2026 section + 8 month-to-month)", () => {
    const r = load();
    expect(r.leases.length).toBe(14);
    const m2m = r.leases.filter((l) => l.isMonthToMonth);
    expect(m2m.length).toBe(8);
    const monthly = r.leases.filter((l) => !l.isMonthToMonth);
    expect(monthly.length).toBe(6);
  });

  it("APR 2026 section includes unit 208 (Strand) and 507 (Dose)", () => {
    const r = load();
    const inMonth = r.leases.filter((l) => !l.isMonthToMonth).map((l) => l.unitNumber).sort();
    expect(inMonth).toEqual(["208", "507", "508", "601", "602", "610"]);
  });

  it("month-to-month section flags unit 309 (Miller) with null leaseEnd", () => {
    const r = load();
    const miller = r.leases.find(
      (l) => l.unitNumber === "309" && /Miller/.test(l.tenantName),
    );
    expect(miller).toBeDefined();
    expect(miller!.isMonthToMonth).toBe(true);
    expect(miller!.leaseEnd).toBeNull();
  });

  it("captures move-out dates when present", () => {
    const r = load();
    const dose = r.leases.find((l) => l.unitNumber === "507" && /Dose/.test(l.tenantName));
    expect(dose).toBeDefined();
    expect(dose!.moveOut).toBe("2025-12-21"); // serial 46012
  });

  it("does not include the Total: rows", () => {
    const r = load();
    for (const l of r.leases) {
      expect(l.tenantName).not.toMatch(/^total/i);
      expect(l.unitNumber).not.toMatch(/^total/i);
    }
  });
});
