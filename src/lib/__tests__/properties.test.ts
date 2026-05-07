// Vitest runs in node — localStorage isn't defined there. We install a
// minimal in-memory shim before importing the module under test, then call
// `_resetForTests` between cases to keep them isolated.

import { afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";

class FakeStorage {
  private map = new Map<string, string>();
  getItem(k: string): string | null {
    return this.map.get(k) ?? null;
  }
  setItem(k: string, v: string): void {
    this.map.set(k, v);
  }
  removeItem(k: string): void {
    this.map.delete(k);
  }
  clear(): void {
    this.map.clear();
  }
  get length(): number {
    return this.map.size;
  }
  key(i: number): string | null {
    return Array.from(this.map.keys())[i] ?? null;
  }
}

beforeAll(() => {
  const w = globalThis as unknown as {
    window?: { localStorage: FakeStorage; addEventListener: () => void };
    localStorage?: FakeStorage;
    addEventListener?: () => void;
  };
  const storage = new FakeStorage();
  // Both `window.localStorage` (what the module guards on) and a top-level
  // `localStorage` (so any incidental access still works).
  w.window = {
    localStorage: storage,
    addEventListener: () => undefined,
  };
  w.localStorage = storage;
  w.addEventListener = () => undefined;
});

// Import after the shim is installed so module-level `typeof window` checks
// see our fake.
import {
  _STORAGE_KEY,
  _resetForTests,
  createProperty,
  deleteProperty,
  getActiveProperty,
  getProperty,
  getReportsFor,
  listProperties,
  saveReportsFor,
  setActiveProperty,
  subscribe,
} from "../properties";
import { burnside } from "@/data/sample";

beforeEach(() => {
  _resetForTests();
});

afterEach(() => {
  _resetForTests();
});

describe("first-visit seed", () => {
  it("seeds Burnside as the active property when no localStorage entry exists", () => {
    const list = listProperties();
    expect(list.length).toBe(1);
    expect(list[0]!.id).toBe(burnside.id);
    expect(getActiveProperty()?.id).toBe(burnside.id);
  });

  it("persists the seeded store so the second call is a no-op read", () => {
    listProperties();
    const raw = (globalThis as unknown as { window: { localStorage: FakeStorage } })
      .window.localStorage.getItem(_STORAGE_KEY);
    expect(raw).not.toBeNull();
    const parsed = JSON.parse(raw!);
    expect(parsed.hasBeenSeeded).toBe(true);
    expect(parsed.properties.length).toBe(1);
  });
});

describe("create / list / setActive", () => {
  it("createProperty appends and switches active", () => {
    listProperties(); // ensure seed
    const created = createProperty({
      name: "Pearl Tower",
      address: "100 NW Pearl",
      ownerName: "Pearl LLC",
      city: "Portland",
      state: "OR",
    });
    const all = listProperties();
    expect(all.length).toBe(2);
    expect(all.map((p) => p.id)).toContain(created.id);
    expect(getActiveProperty()?.id).toBe(created.id);
    expect(created.property.units).toEqual([]);
    expect(created.property.monthlyFinancials).toEqual([]);
    expect(created.property.address.city).toBe("Portland");
    expect(created.property.ownerName).toBe("Pearl LLC");
  });

  it("createProperty handles minimal input (name only)", () => {
    listProperties();
    const created = createProperty({ name: "Solo" });
    expect(created.property.name).toBe("Solo");
    expect(created.property.ownerName).toBe("");
    expect(created.property.address.street).toBe("");
  });

  it("setActiveProperty silently ignores unknown ids", () => {
    listProperties();
    setActiveProperty("does-not-exist");
    expect(getActiveProperty()?.id).toBe(burnside.id);
  });
});

describe("delete behaviour", () => {
  it("deleting the active property promotes the next one in list order", () => {
    listProperties();
    const a = createProperty({ name: "A" }); // becomes active
    const b = createProperty({ name: "B" }); // becomes active
    expect(getActiveProperty()?.id).toBe(b.id);
    deleteProperty(b.id);
    // Order: [burnside, A]. First remaining wins.
    expect(getActiveProperty()?.id).toBe(burnside.id);
    expect(listProperties().map((p) => p.id)).toEqual([burnside.id, a.id]);
  });

  it("deleting a non-active property keeps the current active one", () => {
    listProperties();
    const a = createProperty({ name: "A" });
    setActiveProperty(burnside.id);
    deleteProperty(a.id);
    expect(getActiveProperty()?.id).toBe(burnside.id);
  });

  it("deleting the last property leaves an empty list with activeId=null and does NOT re-seed", () => {
    listProperties();
    deleteProperty(burnside.id);
    expect(listProperties()).toEqual([]);
    expect(getActiveProperty()).toBeUndefined();
    // hasBeenSeeded must stay true — re-fetching shouldn't re-seed Burnside.
    const list2 = listProperties();
    expect(list2).toEqual([]);
  });
});

describe("saveReportsFor — manual metadata wins", () => {
  it("preserves user-entered name / address / owner over parsed values", () => {
    listProperties();
    const stored = createProperty({
      name: "My Building",
      address: "12 Main",
      ownerName: "Me LLC",
      city: "Bend",
      state: "OR",
    });

    // Simulate the parser: fills in everything but with different metadata
    // that should NOT win.
    const parsed = {
      ...stored.property,
      name: "Parsed Building",
      ownerName: "Parsed LLC",
      address: { street: "Parsed", city: "Parsed", state: "ZZ", zip: "00000" },
      propertyType: "apartment-building" as const,
      reportingPeriod: "2026-04-01",
      units: [],
      arBalances: [],
      workOrders: [],
      monthlyFinancials: [],
    };
    saveReportsFor(stored.id, {
      property: parsed,
      reports: { reportsParsedCount: 3, warnings: [], missingReports: ["workOrders", "agedReceivables"] },
    });

    const after = getProperty(stored.id)!;
    expect(after.property.name).toBe("My Building");
    expect(after.property.ownerName).toBe("Me LLC");
    expect(after.property.address.street).toBe("12 Main");
    expect(after.property.address.city).toBe("Bend");
    expect(after.property.address.state).toBe("OR");
    expect(after.property.reportingPeriod).toBe("2026-04-01");
    expect(after.reports.reportsParsedCount).toBe(3);
  });

  it("falls back to parsed values when the manual field is empty", () => {
    listProperties();
    const stored = createProperty({ name: "Bare" }); // no address/owner
    const parsed = {
      ...stored.property,
      ownerName: "Inferred Owner",
      address: { street: "555 Inferred", city: "Inferred City", state: "WA", zip: "98101" },
      reportingPeriod: "2026-04-01",
    };
    saveReportsFor(stored.id, {
      property: parsed,
      reports: { reportsParsedCount: 1, warnings: [], missingReports: [] },
    });
    const after = getProperty(stored.id)!;
    expect(after.property.name).toBe("Bare"); // user-entered wins
    expect(after.property.ownerName).toBe("Inferred Owner");
    expect(after.property.address.city).toBe("Inferred City");
  });

  it("getReportsFor returns the saved counts and warnings", () => {
    listProperties();
    const stored = createProperty({ name: "X" });
    saveReportsFor(stored.id, {
      property: stored.property,
      reports: {
        reportsParsedCount: 2,
        warnings: ["Aged Receivables not uploaded — approximated."],
        missingReports: ["agedReceivables", "workOrders"],
      },
    });
    const r = getReportsFor(stored.id);
    expect(r?.reportsParsedCount).toBe(2);
    expect(r?.warnings.length).toBe(1);
    expect(r?.missingReports).toContain("agedReceivables");
  });
});

describe("subscribe", () => {
  it("notifies same-tab subscribers on each mutation", () => {
    listProperties();
    let calls = 0;
    const unsub = subscribe(() => {
      calls += 1;
    });
    createProperty({ name: "A" });
    expect(calls).toBeGreaterThanOrEqual(1);
    setActiveProperty(burnside.id);
    expect(calls).toBeGreaterThanOrEqual(2);
    deleteProperty(burnside.id);
    expect(calls).toBeGreaterThanOrEqual(3);
    unsub();
    const before = calls;
    createProperty({ name: "B" });
    expect(calls).toBe(before);
  });
});
