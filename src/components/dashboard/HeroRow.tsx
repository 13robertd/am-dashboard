import type { Property } from "@/types/portfolio";
import { Badge } from "@/components/ui/badge";
import { KpiCard } from "@/components/dashboard/KpiCard";
import { formatCurrency, formatCurrencyExact, formatPercent } from "@/lib/format";
import {
  delinquencies,
  netCashFlowThisMonth,
  noiThisMonth,
  occupancyRate,
  rentCollectedThisMonth,
  rentCollectionPercent,
  rentExpectedThisMonth,
} from "@/lib/metrics";

const isMultifamily = (p: Property) => p.units.length >= 5;

export function HeroRow({ property }: { property: Property }) {
  return isMultifamily(property) ? (
    <MultifamilyHero property={property} />
  ) : (
    <SfrHero property={property} />
  );
}

function MultifamilyHero({ property }: { property: Property }) {
  const occ = occupancyRate(property);
  const expected = rentExpectedThisMonth(property);
  const collected = rentCollectedThisMonth(property);
  const collectPct = rentCollectionPercent(property);
  const noi = noiThisMonth(property);
  const delq = delinquencies(property);

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
      <KpiCard
        label="Occupancy"
        value={formatPercent(occ.percent)}
        sub={`${occ.occupied} of ${occ.total} occupied`}
      />
      <KpiCard
        label="Rent Collected"
        value={formatPercent(collectPct)}
        sub={`${formatCurrency(collected, { compact: true })} of ${formatCurrency(expected, { compact: true })}`}
      />
      <KpiCard label="NOI" value={formatCurrency(noi)} sub="this month" />
      <KpiCard
        label="Delinquencies"
        value={formatCurrency(delq.totalOwed)}
        sub={
          delq.tenantCount === 0
            ? "All current"
            : `${delq.tenantCount} late · ${delq.oldestBucket} days`
        }
      />
    </div>
  );
}

function SfrHero({ property }: { property: Property }) {
  const unit = property.units[0];
  const status = unit?.status ?? "vacant-not-ready";
  const rentExpected = rentExpectedThisMonth(property);
  const rentCollected = rentCollectedThisMonth(property);
  const cashFlow = netCashFlowThisMonth(property);
  const isPaid = rentCollected >= rentExpected && rentExpected > 0;

  const statusBadge =
    status === "occupied" ? (
      <Badge variant="green">Occupied</Badge>
    ) : status === "notice" ? (
      <Badge variant="amber">On notice</Badge>
    ) : status === "vacant-ready" ? (
      <Badge variant="blue">Vacant — ready</Badge>
    ) : (
      <Badge variant="red">Vacant — turning</Badge>
    );

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
      <KpiCard
        label="Status"
        value={<span className="inline-flex">{statusBadge}</span>}
        sub={unit?.currentLease?.tenantName ?? "—"}
      />
      <KpiCard
        label="Rent Paid"
        value={isPaid ? "Yes" : "No"}
        sub={`${formatCurrencyExact(rentCollected)} of ${formatCurrencyExact(rentExpected)}`}
      />
      <KpiCard
        label="Cash Flow"
        value={formatCurrency(cashFlow)}
        sub="this month"
      />
    </div>
  );
}
