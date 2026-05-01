import type {
  Property,
  Unit,
  UnitStatus,
  ARBalance,
  MonthlyFinancial,
} from "@/types/portfolio";

function mulberry32(seed: number) {
  let a = seed;
  return function () {
    a = (a + 0x6d2b79f5) | 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const rand = mulberry32(20260401);
const pick = <T,>(arr: T[]) => arr[Math.floor(rand() * arr.length)];
const between = (lo: number, hi: number) => Math.floor(rand() * (hi - lo + 1)) + lo;

// Unit type catalog — sqft figures from real Entrata export.
const STUDIO_TYPES = [
  { code: "LBLEFF1", sqft: 385, market: 1245, scheduled: 1215 },
  { code: "LBLEFF3", sqft: 462, market: 1295, scheduled: 1255 },
  { code: "LBLEFF4", sqft: 544, market: 1325, scheduled: 1295 },
  { code: "LBLERR2", sqft: 399, market: 1255, scheduled: 1225 },
];
const ONE_BR_TYPES = Array.from({ length: 13 }, (_, i) => ({
  code: `LBLA${i + 1}`,
  sqft: 507 + Math.round((i * (608 - 507)) / 12),
  market: 1425 + i * 12,
  scheduled: 1395 + i * 11,
}));
const TWO_BR_TYPES = Array.from({ length: 5 }, (_, i) => ({
  code: `LBLB${i + 1}`,
  sqft: 775 + Math.round((i * (966 - 775)) / 4),
  market: 1750 + i * 55,
  scheduled: 1700 + i * 50,
}));

type UnitTypeDef = { code: string; sqft: number; market: number; scheduled: number };
function findType(code: string): UnitTypeDef {
  const all = [...STUDIO_TYPES, ...ONE_BR_TYPES, ...TWO_BR_TYPES];
  const t = all.find((x) => x.code === code);
  if (!t) throw new Error(`unknown unit type ${code}`);
  return t;
}
function bedsFor(code: string): { bedrooms: number; bathrooms: number } {
  if (code.startsWith("LBLEFF") || code.startsWith("LBLERR")) {
    return { bedrooms: 0, bathrooms: 1 };
  }
  if (code.startsWith("LBLA")) return { bedrooms: 1, bathrooms: 1 };
  return { bedrooms: 2, bathrooms: 1 };
}

// 11 hand-authored anchor units — names, dates, rents per SPEC §6.
const ANCHOR_UNITS: Array<{
  unitNumber: string;
  typeCode: string;
  status: UnitStatus;
  tenant?: string;
  startDate?: string;
  endDate?: string | null;
  monthlyRent?: number;
  expectedMoveOut?: string | null;
}> = [
  {
    unitNumber: "102",
    typeCode: "LBLEFF4",
    status: "notice",
    tenant: "Schmidt, Austin",
    startDate: "2025-05-16",
    endDate: "2026-05-15",
    monthlyRent: 1295,
    expectedMoveOut: "2026-05-15",
  },
  {
    unitNumber: "207",
    typeCode: "LBLB4",
    status: "occupied",
    tenant: "Lubbehusen, Morgan",
    startDate: "2025-06-14",
    endDate: "2026-06-13",
    monthlyRent: 1895,
  },
  {
    unitNumber: "208",
    typeCode: "LBLA9",
    status: "occupied",
    tenant: "Strand, Kristopher",
    startDate: "2024-05-09",
    endDate: "2026-05-08",
    monthlyRent: 1495,
  },
  {
    unitNumber: "308",
    typeCode: "LBLA8",
    status: "notice",
    tenant: "Welch, Anthony",
    startDate: "2025-05-31",
    endDate: "2026-05-30",
    monthlyRent: 1485,
    expectedMoveOut: "2026-05-30",
  },
  {
    unitNumber: "311",
    typeCode: "LBLEFF3",
    status: "occupied",
    tenant: "Claxton-Garcia, Jhonnattan",
    startDate: "2025-07-01",
    endDate: "2026-06-30",
    monthlyRent: 1225,
  },
  {
    unitNumber: "502",
    typeCode: "LBLA7",
    status: "occupied",
    tenant: "Hoke, Willis",
    startDate: "2025-06-23",
    endDate: "2026-06-22",
    monthlyRent: 1475,
  },
  {
    unitNumber: "504",
    typeCode: "LBLA6",
    status: "notice",
    tenant: "Robbins, Roxy",
    startDate: "2024-08-16",
    endDate: "2026-08-15",
    monthlyRent: 1455,
    expectedMoveOut: "2026-06-15",
  },
  {
    unitNumber: "507",
    typeCode: "LBLB4",
    status: "occupied",
    tenant: "Westphal, Theresa",
    startDate: "2024-05-01",
    endDate: "2027-04-30",
    monthlyRent: 1944,
  },
  { unitNumber: "508", typeCode: "LBLA9", status: "vacant-not-ready" },
  { unitNumber: "608", typeCode: "LBLB2", status: "vacant-ready" },
  { unitNumber: "610", typeCode: "LBLB1", status: "vacant-not-ready" },
];

// All 61 unit numbers — 6 floors × ~10 units. Anchors carved out, rest are filler.
const ALL_UNIT_NUMBERS: string[] = [
  "101", "102", "103", "104", "105", "106", "107", "108", "109", "110",
  "201", "202", "203", "204", "205", "206", "207", "208", "209", "210",
  "301", "302", "303", "304", "305", "306", "307", "308", "309", "310", "311", "312",
  "401", "402", "403", "404", "405", "406", "407", "408", "409", "410",
  "501", "502", "503", "504", "505", "506", "507", "508", "509",
  "601", "602", "603", "604", "605", "606", "607", "608", "609", "610",
];

// Filler lease end-dates spread July 2026 → August 2027 — all OUTSIDE the
// 60-day expiration window from the 2026-04-01 reporting period.
function fillerEndDate(i: number): string {
  const startMonth = 7;
  const month = startMonth + (i % 14);
  const yr = 2026 + Math.floor((month - 1) / 12);
  const m = ((month - 1) % 12) + 1;
  const day = ((i * 7) % 27) + 1;
  return `${yr}-${String(m).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function buildBurnside(): Property {
  const anchorNumbers = new Set(ANCHOR_UNITS.map((a) => a.unitNumber));
  const fillerNumbers = ALL_UNIT_NUMBERS.filter((n) => !anchorNumbers.has(n));

  // Filler distribution: 50 units = 49 occupied + 1 notice (the missing
  // notice rented; combined with the 3 anchor notices => 4 total notice).
  // Spec target: 54 occupied + 4 notice + 1 vacant-ready + 2 vacant-not-ready = 61.
  const fillerStatuses: UnitStatus[] = [];
  for (let i = 0; i < 49; i += 1) fillerStatuses.push("occupied");
  fillerStatuses.push("notice");

  const units: Unit[] = [];

  // Anchors first
  for (const a of ANCHOR_UNITS) {
    const t = findType(a.typeCode);
    const beds = bedsFor(a.typeCode);
    const isVacant = a.status.startsWith("vacant");
    units.push({
      id: `burnside-${a.unitNumber}`,
      unitNumber: a.unitNumber,
      unitType: a.typeCode,
      bedrooms: beds.bedrooms,
      bathrooms: beds.bathrooms,
      squareFeet: t.sqft,
      status: a.status,
      marketRent: t.market,
      scheduledRent: isVacant ? t.market : a.monthlyRent ?? t.scheduled,
      currentLease:
        isVacant || !a.tenant
          ? undefined
          : {
              tenantName: a.tenant,
              startDate: a.startDate ?? "2025-01-01",
              endDate: a.endDate ?? null,
              monthlyRent: a.monthlyRent ?? t.scheduled,
              securityDeposit: a.monthlyRent ?? t.scheduled,
              expectedMoveOut: a.expectedMoveOut ?? null,
            },
    });
  }

  // Filler
  fillerNumbers.forEach((unitNumber, idx) => {
    const status = fillerStatuses[idx];
    // Bias type by unit number first digit so floors look believable.
    const floor = parseInt(unitNumber[0]!, 10);
    const r = rand();
    let typeDef: UnitTypeDef;
    if (floor <= 2) {
      typeDef = r < 0.55 ? pick(STUDIO_TYPES) : r < 0.85 ? pick(ONE_BR_TYPES) : pick(TWO_BR_TYPES);
    } else if (floor <= 4) {
      typeDef = r < 0.3 ? pick(STUDIO_TYPES) : r < 0.8 ? pick(ONE_BR_TYPES) : pick(TWO_BR_TYPES);
    } else {
      typeDef = r < 0.2 ? pick(STUDIO_TYPES) : r < 0.65 ? pick(ONE_BR_TYPES) : pick(TWO_BR_TYPES);
    }
    const beds = bedsFor(typeDef.code);
    const monthlyRent = typeDef.scheduled + between(-30, 30);
    const tenant = TENANT_NAMES[idx % TENANT_NAMES.length];
    const endDate = fillerEndDate(idx);
    const startDate = `${parseInt(endDate.slice(0, 4), 10) - 1}${endDate.slice(4)}`;
    units.push({
      id: `burnside-${unitNumber}`,
      unitNumber,
      unitType: typeDef.code,
      bedrooms: beds.bedrooms,
      bathrooms: beds.bathrooms,
      squareFeet: typeDef.sqft,
      status,
      marketRent: typeDef.market,
      scheduledRent: monthlyRent,
      currentLease: {
        tenantName: tenant,
        startDate,
        endDate,
        monthlyRent,
        securityDeposit: monthlyRent,
        expectedMoveOut: status === "notice" ? endDate : null,
      },
    });
  });

  units.sort((a, b) => a.unitNumber.localeCompare(b.unitNumber));

  const arBalances: ARBalance[] = [
    {
      unitId: "burnside-507",
      tenantName: "Westphal, Theresa",
      totalOwed: 453.6,
      agingBuckets: {
        days0to30: 453.6,
        days31to60: 0,
        days61to90: 0,
        daysOver90: 0,
      },
    },
  ];

  const monthlyFinancials: MonthlyFinancial[] = [
    {
      month: "2026-01-01",
      income: 84418.6,
      operatingExpenses: 46283.27,
      noi: 38135.33,
      nonOperatingExpenses: 58698.35,
      netProfit: -20561.66,
      maintenanceSpend: 1947.99,
    },
    {
      month: "2026-02-01",
      income: 85387.75,
      operatingExpenses: 35724.05,
      noi: 49663.7,
      nonOperatingExpenses: 35521.31,
      netProfit: 14143.75,
      maintenanceSpend: 2333.39,
    },
    {
      month: "2026-03-01",
      income: 90058.92,
      operatingExpenses: 41460.35,
      noi: 48598.57,
      nonOperatingExpenses: 51652.58,
      netProfit: -3052.78,
      maintenanceSpend: 6373.95,
    },
    {
      month: "2026-04-01",
      income: 90429.98,
      operatingExpenses: 40671.98,
      noi: 49758.0,
      nonOperatingExpenses: 33346.74,
      netProfit: 16411.26,
      maintenanceSpend: 6350.14,
    },
  ];

  return {
    id: "burnside",
    name: "The Lower Burnside Lofts",
    ownerName: "Burnside Holdings LLC",
    address: {
      street: "412 SE Burnside St",
      city: "Portland",
      state: "OR",
      zip: "97214",
    },
    propertyType: "apartment-building",
    reportingPeriod: "2026-04-01",
    units,
    arBalances,
    workOrders: [],
    monthlyFinancials,
  };
}

const TENANT_NAMES = [
  "Aldrich, Sam", "Boyer, Lacey", "Cruz, Mateo", "Doan, Tien", "Ekberg, Anders",
  "Frith, Jolene", "Gunderson, Pia", "Hayward, Reed", "Iyer, Anjali", "Joyner, Cal",
  "Kowal, Petra", "Lambert, Devon", "Mukai, Hiroshi", "Norse, Hannah", "Okonkwo, Chima",
  "Pham, Linh", "Quist, Briar", "Rosales, Lupe", "Suarez, Diego", "Trotter, Marcy",
  "Underwood, Gail", "Vargas, Toni", "Wexler, Pat", "Xanthos, Iris", "Yamada, Ren",
  "Zorn, Caleb", "Asher, Pearl", "Bowman, Niles", "Carrara, Faye", "Delgado, Rio",
  "Esposito, Vee", "Fontaine, June", "Gillis, Owen", "Holst, Eira", "Imani, Naima",
  "Janssen, Coen", "Kapoor, Veer", "Lehrer, Mona", "Maddox, Reese", "Naughton, Pip",
  "Olszewski, Kazia", "Petrov, Lev", "Quinto, Sage", "Rinehart, Tate", "Sosa, Bella",
  "Taggart, Wren", "Ueda, Sora", "Vidal, Magda", "Wynn, Foster", "Ybarra, Lucia",
];

function buildMaple(): Property {
  return {
    id: "maple",
    name: "123 Maple Street",
    ownerName: "Smith Family Trust",
    address: { street: "123 Maple St", city: "Eugene", state: "OR", zip: "97401" },
    propertyType: "single-family",
    reportingPeriod: "2026-04-01",
    units: [
      {
        id: "maple-main",
        unitNumber: "Main",
        unitType: "SFR-3BR",
        bedrooms: 3,
        bathrooms: 2,
        squareFeet: 1650,
        status: "occupied",
        marketRent: 2800,
        scheduledRent: 2800,
        currentLease: {
          tenantName: "John Smith",
          startDate: "2025-08-01",
          endDate: "2026-07-31",
          monthlyRent: 2800,
          securityDeposit: 2800,
          expectedMoveOut: null,
        },
      },
    ],
    arBalances: [],
    workOrders: [],
    monthlyFinancials: [
      {
        month: "2026-01-01",
        income: 2800,
        operatingExpenses: 980,
        noi: 1820,
        nonOperatingExpenses: 1200,
        netProfit: 620,
        maintenanceSpend: 0,
      },
      {
        month: "2026-02-01",
        income: 2800,
        operatingExpenses: 920,
        noi: 1880,
        nonOperatingExpenses: 1200,
        netProfit: 680,
        maintenanceSpend: 0,
      },
      {
        month: "2026-03-01",
        income: 2800,
        operatingExpenses: 1100,
        noi: 1700,
        nonOperatingExpenses: 1200,
        netProfit: 500,
        maintenanceSpend: 250,
      },
      {
        month: "2026-04-01",
        income: 2800,
        operatingExpenses: 950,
        noi: 1850,
        nonOperatingExpenses: 1200,
        netProfit: 650,
        maintenanceSpend: 150,
      },
    ],
  };
}

export const burnside: Property = buildBurnside();
export const maple: Property = buildMaple();
export const sampleProperties: Property[] = [burnside, maple];
