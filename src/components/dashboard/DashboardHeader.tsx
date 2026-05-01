import { Fragment } from "react";
import type { Property } from "@/types/portfolio";
import { formatLongDate, formatMonthYearLong } from "@/lib/format";
import { REPORT_TOTAL } from "@/lib/reports";

interface DashboardHeaderProps {
  property: Property;
  uploaded: number;
}

export function DashboardHeader({ property, uploaded }: DashboardHeaderProps) {
  const lastUpdated = formatLongDate(new Date().toISOString().slice(0, 10));

  // Build the meta line out of only the segments that actually have content,
  // so uploaded properties without an owner or address don't show dangling
  // commas or empty separators.
  const cityState = [property.address.city, property.address.state]
    .filter((s) => s && s.trim() !== "")
    .join(", ");
  const metaSegments = [
    property.ownerName,
    cityState,
    `As of ${formatMonthYearLong(property.reportingPeriod)}`,
  ].filter((s) => s && s.trim() !== "");

  return (
    <div className="border-b border-zinc-200 pb-4">
      <h1 className="text-2xl font-semibold tracking-tight text-zinc-900">
        {property.name}
      </h1>
      <p className="mt-1 text-sm text-zinc-500">
        {metaSegments.map((seg, i) => (
          <Fragment key={i}>
            {i > 0 ? <span className="mx-2 text-zinc-300">·</span> : null}
            {seg}
          </Fragment>
        ))}
      </p>
      <p className="mt-1 text-xs text-zinc-500">
        Reports uploaded: {uploaded} of {REPORT_TOTAL}
        <span className="mx-2 text-zinc-300">·</span>
        Last updated {lastUpdated}
      </p>
    </div>
  );
}
