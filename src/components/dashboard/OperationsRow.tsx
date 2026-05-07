import { CalendarClock, FileSpreadsheet, Wrench } from "lucide-react";
import type { Property } from "@/types/portfolio";
import { KpiCard } from "@/components/dashboard/KpiCard";
import { Delta } from "@/components/dashboard/Delta";
import { PlaceholderCard } from "@/components/dashboard/PlaceholderCard";
import {
  formatCurrencyAggregate,
  formatLongDate,
  formatShortDate,
} from "@/lib/format";
import {
  leaseExpirations,
  maintenanceDelta,
  maintenanceSpendThisMonth,
} from "@/lib/metrics";

// Match HeroRow: empty properties (no rent roll yet) take the multifamily
// layout so placeholders render in a consistent grid.
const isMultifamily = (p: Property) => p.units.length === 0 || p.units.length >= 5;

export function OperationsRow({ property }: { property: Property }) {
  return isMultifamily(property) ? (
    <MultifamilyOps property={property} />
  ) : (
    <SfrOps property={property} />
  );
}

function MultifamilyOps({ property }: { property: Property }) {
  const hasUnits = property.units.length > 0;
  const hasFinancials = property.monthlyFinancials.length > 0;

  const expirations = leaseExpirations(property);
  const maintSpend = maintenanceSpendThisMonth(property);
  const top = expirations.slice(0, 5);

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
      <PlaceholderCard
        label="Open Work Orders"
        message="Data needed — Upload Work Order Report to show open work orders."
        icon={Wrench}
      />
      {hasUnits ? (
        <KpiCard
          label="Upcoming Lease Expirations"
          value={`${expirations.length} in 90d`}
          sub={
            top.length === 0 ? (
              "No upcoming expirations"
            ) : (
              <ul className="mt-2 space-y-1 text-xs">
                {top.map((e) => (
                  <li key={e.unitNumber} className="flex justify-between gap-3 text-zinc-600">
                    <span className="truncate">
                      <span className="font-medium text-zinc-700">#{e.unitNumber}</span>{" "}
                      {e.tenant}
                    </span>
                    <span className="tabular-nums text-zinc-500">
                      {formatShortDate(e.endDate)}
                    </span>
                  </li>
                ))}
              </ul>
            )
          }
        />
      ) : (
        <PlaceholderCard
          label="Upcoming Lease Expirations"
          message="Data needed — Upload Rent Roll to show upcoming lease expirations."
          icon={CalendarClock}
        />
      )}
      {hasFinancials ? (
        <KpiCard
          label="Maintenance Spend"
          value={formatCurrencyAggregate(maintSpend)}
          delta={<Delta delta={maintenanceDelta(property)} polarity="neutral" />}
        />
      ) : (
        <PlaceholderCard
          label="Maintenance Spend"
          message="Data needed — Upload Income Statement to show maintenance spend."
          icon={FileSpreadsheet}
        />
      )}
    </div>
  );
}

function SfrOps({ property }: { property: Property }) {
  const lease = property.units[0]?.currentLease;
  const leaseLine = lease?.endDate
    ? `Lease expires ${formatLongDate(lease.endDate)}`
    : "Month-to-month";

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
      <PlaceholderCard
        label="Open Issues"
        message="Data needed — Upload Work Order Report to show open issues."
        icon={Wrench}
      />
      <KpiCard label="Lease" value={leaseLine} sub={lease?.tenantName ?? ""} />
    </div>
  );
}
