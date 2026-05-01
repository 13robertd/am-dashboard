// Internal Entrata-specific types. These MUST NOT leak outside this folder —
// the rest of the app sees only the normalized shapes from `@/types/portfolio`.

import type { ARBalance, MonthlyFinancial, Unit } from "@/types/portfolio";

// Raw Entrata unit-status strings (5 buckets). Normalised down to the 4-bucket
// `UnitStatus` from the public model elsewhere.
export type EntrataUnitStatus =
  | "Occupied No Notice"
  | "Notice Rented"
  | "Notice Unrented"
  | "Vacant Unrented Ready"
  | "Vacant Unrented Not Ready";

// Each parser returns a small typed result containing data plus any non-fatal
// warnings emitted during parsing. Names are kept generic so the public
// adapter can compose them into a `Property`.

// Per-unit balance from the Rent Roll's Balance column. Used to approximate
// AR when no Aged Receivables report was uploaded.
export interface RentRollBalance {
  unitNumber: string;
  tenantName: string;
  balance: number;
}

export interface RentRollResult {
  propertyName: string;
  period: string;
  units: Unit[];
  balances: RentRollBalance[];
}

export interface IncomeStatementResult {
  propertyName: string;
  period: string;
  financials: MonthlyFinancial[];
}

export interface ExpiringLeaseRow {
  unitNumber: string;
  tenantName: string;
  leaseEnd: string | null;
  moveOut: string | null;
  isMonthToMonth: boolean;
}

export interface ExpiringLeasesResult {
  propertyName: string;
  period: string;
  leases: ExpiringLeaseRow[];
}

export interface AgedReceivablesResult {
  propertyName: string;
  period: string;
  balances: Array<Omit<ARBalance, "unitId"> & { unitNumber: string }>;
}

// Detected report type, used for wrong-slot detection in Phase 3.
export type EntrataReportType =
  | "rentRoll"
  | "incomeStatement"
  | "expiringLeases"
  | "agedReceivables"
  | "workOrders"
  | "unknown";
