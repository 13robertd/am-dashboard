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
    // monthlyRent must equal the full Charge Total so rent-collection metrics
    // sum the same numbers a property manager would (residential + parking).
    expect(u!.currentLease!.monthlyRent).toBeCloseTo(1499, 2);
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

// Second fixture from a different Entrata export variant: plain "Rent Roll"
// (not "Rent Roll w/ Lease Charges"). The header has 14 columns instead of
// 15 — Ledger and Charge Code are gone, Actual Charges is added between
// Market Rent and Scheduled Charges. The footer reads "<Property Name>
// Total:" instead of bare "Total:". Lock the column-resolver and stop-row
// fixes so the production export shape can't silently regress.
const FIXTURE_V2 = path.resolve(
  process.cwd(),
  "test-fixtures/entrata/rent-roll-v2.xlsx",
);

function loadV2() {
  return parseRentRoll(readFileSync(FIXTURE_V2));
}

describe("parseRentRoll — Lower Burnside (plain Rent Roll variant)", () => {
  it("returns 63 units (matches the sheet's Total Rentable Units)", () => {
    expect(loadV2().units.length).toBe(63);
  });

  it("does not let the property-name Total: footer leak into the unit list", () => {
    const r = loadV2();
    for (const u of r.units) {
      expect(u.unitNumber.toLowerCase()).not.toContain("total");
      // The footer had Balance = -16342.18; it must not show up as a unit.
      expect(u.scheduledRent).not.toBeCloseTo(-16342.18, 2);
    }
  });

  it("status distribution matches the Status Summary (54/4/3/2)", () => {
    const r = loadV2();
    const counts = { occupied: 0, notice: 0, "vacant-ready": 0, "vacant-not-ready": 0 };
    for (const u of r.units) counts[u.status] += 1;
    // 1 Notice Rented + 3 Notice Unrented = 4 notice.
    // 2 Vacant Rented Ready + 1 Vacant Unrented Ready = 3 vacant-ready.
    expect(counts).toEqual({
      occupied: 54,
      notice: 4,
      "vacant-ready": 3,
      "vacant-not-ready": 2,
    });
  });

  it("scheduled-rent total matches the sheet's Total: row ($86,379)", () => {
    const r = loadV2();
    const total = r.units.reduce((s, u) => s + u.scheduledRent, 0);
    expect(total).toBeCloseTo(86379, 0);
  });

  it("reads scheduledRent from the Scheduled Charges column, not Balance", () => {
    // Unit 102: Scheduled Charges = 1625, Balance = 0. If columns were read
    // by hard-coded position the parser would pick up Balance instead.
    const r = loadV2();
    const u = r.units.find((x) => x.unitNumber === "102");
    expect(u?.scheduledRent).toBeCloseTo(1625, 2);
  });

  it("captures only positive Rent Roll balances for AR approximation", () => {
    const r = loadV2();
    // Unit 504 (Robbins) is the only delinquent balance in this sheet ($2,019).
    // Every other entry is zero or a credit (prepayment).
    expect(r.balances.length).toBe(1);
    expect(r.balances[0]?.unitNumber).toBe("504");
    expect(r.balances[0]?.balance).toBeCloseTo(2019, 2);
  });
});
