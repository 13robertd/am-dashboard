export type PropertyType =
  | "single-family"
  | "small-multifamily"
  | "apartment-building";

// Normalized to 4 buckets. Entrata's 5 raw statuses map into these:
//   "Occupied No Notice"        -> 'occupied'
//   "Notice Rented"             -> 'notice'  (already has replacement)
//   "Notice Unrented"           -> 'notice'  (no replacement yet)
//   "Vacant Unrented Ready"     -> 'vacant-ready'
//   "Vacant Unrented Not Ready" -> 'vacant-not-ready'
export type UnitStatus =
  | "occupied"
  | "notice"
  | "vacant-ready"
  | "vacant-not-ready";

export type WorkOrderPriority = "low" | "medium" | "high" | "emergency";
export type WorkOrderStatus = "open" | "in-progress" | "closed";

export interface Property {
  id: string;
  name: string;
  ownerName: string;
  address: { street: string; city: string; state: string; zip: string };
  propertyType: PropertyType;
  reportingPeriod: string;

  units: Unit[];
  arBalances: ARBalance[];
  workOrders: WorkOrder[];
  monthlyFinancials: MonthlyFinancial[];
}

export interface Unit {
  id: string;
  unitNumber: string;
  unitType: string;
  bedrooms: number;
  bathrooms: number;
  squareFeet: number;
  status: UnitStatus;
  marketRent: number;
  scheduledRent: number;
  currentLease?: Lease;
}

export interface Lease {
  tenantName: string;
  startDate: string;
  endDate: string | null;
  monthlyRent: number;
  securityDeposit: number;
  expectedMoveOut: string | null;
}

export interface ARBalance {
  unitId: string;
  tenantName: string;
  totalOwed: number;
  agingBuckets: {
    days0to30: number;
    days31to60: number;
    days61to90: number;
    daysOver90: number;
  };
}

export interface WorkOrder {
  id: string;
  unitId?: string;
  description: string;
  priority: WorkOrderPriority;
  status: WorkOrderStatus;
  createdDate: string;
  completedDate?: string;
  cost?: number;
}

// One row per month — derived from Entrata's Income Statement Trailing 12.
// NOI is pre-computed by Entrata; store it, don't re-derive it.
export interface MonthlyFinancial {
  month: string;
  income: number;
  operatingExpenses: number;
  noi: number;
  nonOperatingExpenses: number;
  netProfit: number;
  maintenanceSpend: number;
}
