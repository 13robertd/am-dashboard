import { Building, FileSpreadsheet, Wallet } from "lucide-react";
import type { Property } from "@/types/portfolio";
import { Badge } from "@/components/ui/badge";
import { KpiCard } from "@/components/dashboard/KpiCard";
import { Delta } from "@/components/dashboard/Delta";
import { PlaceholderCard } from "@/components/dashboard/PlaceholderCard";
import {
  formatCurrency,
  formatCurrencyAggregate,
  formatCurrencyExact,
  formatPercent,
} from "@/lib/format";
import {
  cashFlowDelta,
  delinquencies,
  netCashFlowThisMonth,
  noiDelta,
  noiThisMonth,
  occupancyRate,
  rentCollectedThisMonth,
  rentCollectionPercent,
  rentExpectedThisMonth,
} from "@/lib/metrics";

// Multifamily detection has to tolerate the "no rent roll yet" case — a
// freshly-created property has zero units. We pick the multifamily layout
// in that scenario so the placeholder grid stays consistent with what the
// dashboard will look like once a rent roll arrives.
const isMultifamily = (p: Property) => p.units.length === 0 || p.units.length >= 5;

export function HeroRow({ property }: { property: Property }) {
  return isMultifamily(property) ? (
    <MultifamilyHero property={property} />
  ) : (
    <SfrHero property={property} />
  );
}

function MultifamilyHero({ property }: { property: Property }) {
  const hasUnits = property.units.length > 0;
  const hasFinancials = property.monthlyFinancials.length > 0;

  const occ = occupancyRate(property);
  const expected = rentExpectedThisMonth(property);
  const collected = rentCollectedThisMonth(property);
  const collectPct = rentCollectionPercent(property);
  const noi = noiThisMonth(property);
  const delq = delinquencies(property);

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
      {hasUnits ? (
        <KpiCard
          label="Occupancy"
          value={formatPercent(occ.percent)}
          sub={`${occ.occupied} of ${occ.total} occupied`}
        />
      ) : (
        <PlaceholderCard
          label="Occupancy"
          message="Data needed — Upload Rent Roll to show occupancy."
          icon={Building}
        />
      )}
      {hasUnits ? (
        <KpiCard
          label="Rent Collection"
          value={formatPercent(collectPct)}
          sub={`${formatCurrencyAggregate(collected, { compact: true })} of ${formatCurrencyAggregate(expected, { compact: true })}`}
        />
      ) : (
        <PlaceholderCard
          label="Rent Collection"
          message="Data needed — Upload Rent Roll to show rent collection."
          icon={Wallet}
        />
      )}
      {hasFinancials ? (
        <KpiCard
          label="NOI"
          value={formatCurrencyAggregate(noi)}
          delta={<Delta delta={noiDelta(property)} polarity="normal" />}
        />
      ) : (
        <PlaceholderCard
          label="NOI"
          message="Data needed — Upload Income Statement to show NOI."
          icon={FileSpreadsheet}
        />
      )}
      {hasUnits ? (
        <KpiCard
          label="Delinquencies"
          value={formatCurrency(delq.totalOwed)}
          sub={
            delq.tenantCount === 0
              ? "All current"
              : `${delq.tenantCount} late · ${delq.oldestBucket} days`
          }
        />
      ) : (
        <PlaceholderCard
          label="Delinquencies"
          message="Data needed — Upload Rent Roll to show delinquencies."
          icon={Wallet}
        />
      )}
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
        value={formatCurrencyAggregate(cashFlow)}
        delta={<Delta delta={cashFlowDelta(property)} polarity="normal" />}
      />
    </div>
  );
}
