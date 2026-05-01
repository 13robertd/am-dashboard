import type { Property } from "@/types/portfolio";
import { formatMonthYear } from "@/lib/format";

export function DashboardHeader({ property }: { property: Property }) {
  return (
    <div className="border-b border-zinc-200 pb-4">
      <h1 className="text-2xl font-semibold tracking-tight text-zinc-900">
        {property.name}
      </h1>
      <p className="mt-1 text-sm text-zinc-500">
        {property.ownerName}
        <span className="mx-2 text-zinc-300">·</span>
        {property.address.city}, {property.address.state}
        <span className="mx-2 text-zinc-300">·</span>
        Reporting period: {formatMonthYear(property.reportingPeriod)}
      </p>
    </div>
  );
}
