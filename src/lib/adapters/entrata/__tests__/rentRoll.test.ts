import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { parseRentRoll } from "../rentRoll";

const FIXTURE = path.resolve(
  process.cwd(),
  "test-fixtures/entrata/rent-roll.xlsx",
);

function loadFixture() {
  const buf = readFileSync(FIXTURE);
  return parseRentRoll(buf);
}

describe("parseRentRoll — Lower Burnside", () => {
  it("extracts the property name and period from header rows", () => {
    const r = loadFixture();
    expect(r.propertyName).toBe("The Lower Burnside Lofts");
    expect(r.period).toBe("Apr 2026");
  });

  it("returns 61 units (matches the sheet's Total Rentable Units)", () => {
    const r = loadFixture();
    expect(r.units.length).toBe(61);
  });

  it("status distribution matches the rent-roll Status Summary (54/4/1/2)", () => {
    const r = loadFixture();
    const counts = { occupied: 0, notice: 0, "vacant-ready": 0, "vacant-not-ready": 0 };
    for (const u of r.units) counts[u.status] += 1;
    expect(counts).toEqual({
      occupied: 54,
      notice: 4,
      "vacant-ready": 1,
      "vacant-not-ready": 2,
    });
  });

  it("scheduled rent total ≈ $86,379 (matches the sheet's Total: row)", () => {
    const r = loadFixture();
    const total = r.units.reduce((s, u) => s + u.scheduledRent, 0);
    expect(total).toBeCloseTo(86379, 0);
  });

  it("unit 102 (Schmidt) — Notice Unrented, lease end matches Excel serial 46150", () => {
    const r = loadFixture();
    const u = r.units.find((x) => x.unitNumber === "102");
    expect(u).toBeDefined();
    expect(u!.status).toBe("notice");
    expect(u!.currentLease?.tenantName).toBe("Schmidt, Austin");
    // Serial 46150 → 2026-05-08 (verifies excelSerialToISO is wired correctly).
    expect(u!.currentLease?.endDate).toBe("2026-05-08");
    expect(u!.currentLease?.expectedMoveOut).toBe("2026-05-08");
    expect(u!.scheduledRent).toBeCloseTo(1625, 2);
  });

  it("unit 204 (Milhauser) — sums Residential + Parking charges", () => {
    const r = loadFixture();
    const u = r.units.find((x) => x.unitNumber === "204");
    expect(u).toBeDefined();
    expect(u!.scheduledRent).toBeCloseTo(1499, 2); // 1314 + 185
  });

  it("vacant unit 608 has no current lease and 0 scheduled rent", () => {
    const r = loadFixture();
    const u = r.units.find((x) => x.unitNumber === "608");
    expect(u).toBeDefined();
    expect(u!.status).toBe("vacant-ready");
    expect(u!.currentLease).toBeUndefined();
    expect(u!.scheduledRent).toBe(0);
  });

  it("month-to-month unit 606 has lease but null endDate", () => {
    const r = loadFixture();
    const u = r.units.find((x) => x.unitNumber === "606");
    expect(u).toBeDefined();
    expect(u!.currentLease).toBeDefined();
    expect(u!.currentLease!.endDate).toBeNull();
  });

  it("unit IDs follow the slug-based convention", () => {
    const r = loadFixture();
    const u = r.units.find((x) => x.unitNumber === "102");
    expect(u!.id).toBe("the-lower-burnside-lofts-102");
  });

  it("does not include rows from the Future Resident Details section", () => {
    const r = loadFixture();
    // The sheet has no future residents; ensure the parser stopped before any.
    for (const u of r.units) {
      expect(u.unitNumber).not.toMatch(/^(total|status)/i);
    }
  });
});
