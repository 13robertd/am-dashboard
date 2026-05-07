"use client";

import { useMemo, useState } from "react";
import { Building, Info } from "lucide-react";
import type { Property } from "@/types/portfolio";
import { listProperties } from "@/lib/queries";
import { REPORT_TOTAL, reportsUploaded } from "@/lib/reports";
import { DashboardHeader } from "@/components/dashboard/DashboardHeader";
import { PropertySwitcher } from "@/components/dashboard/PropertySwitcher";
import {
  ManageReportsButton,
  type ParseSuccessPayload,
} from "@/components/dashboard/ManageReportsButton";
import { HeroRow } from "@/components/dashboard/HeroRow";
import { OperationsRow } from "@/components/dashboard/OperationsRow";
import { FinancialStrip } from "@/components/dashboard/FinancialStrip";
import { FinancialStripT12 } from "@/components/dashboard/FinancialStripT12";

interface UploadNotices {
  warnings: string[];
  missing: string[];
}

// Note: agedReceivables is intentionally omitted — the adapter already emits
// a more specific warning when it approximates balances from the Rent Roll.
const MISSING_LABEL: Record<string, string> = {
  incomeStatement: "No Income Statement uploaded — financials and NOI may show $0.",
  expiringLeases: "No Expiring Leases report uploaded — lease end dates come from the Rent Roll only.",
  workOrders: "No Work Order report uploaded — open work orders not shown.",
};

export default function HomePage() {
  const sampleProperties = useMemo(() => listProperties(), []);
  const [uploadedProperties, setUploadedProperties] = useState<Property[]>([]);
  const [uploadedCounts, setUploadedCounts] = useState<Record<string, number>>(
    {},
  );
  const [uploadedNotices, setUploadedNotices] = useState<
    Record<string, UploadNotices>
  >({});
  const [selectedId, setSelectedId] = useState<string>(
    sampleProperties[0]?.id ?? "",
  );

  // Uploaded properties show first; sample data remains underneath as fallback.
  const properties = useMemo(
    () => [...uploadedProperties, ...sampleProperties],
    [uploadedProperties, sampleProperties],
  );

  const uploadedIds = useMemo(
    () => new Set(uploadedProperties.map((p) => p.id)),
    [uploadedProperties],
  );

  // Derive the active id from the source of truth instead of synchronising
  // it in an effect — keeps render output in sync without cascading updates.
  const activeId = properties.some((p) => p.id === selectedId)
    ? selectedId
    : (properties[0]?.id ?? "");
  const property = properties.find((p) => p.id === activeId);
  if (!property) {
    return <div className="p-8">No properties available.</div>;
  }

  const uploadedCount = uploadedIds.has(property.id)
    ? (uploadedCounts[property.id] ?? 0)
    : reportsUploaded(property);
  const notices = uploadedIds.has(property.id)
    ? uploadedNotices[property.id]
    : undefined;

  const handleParseSuccess = (payload: ParseSuccessPayload) => {
    const { property: parsed, reportsParsedCount, warnings, reportsMissing } = payload;
    setUploadedProperties((curr) => {
      const idx = curr.findIndex((p) => p.id === parsed.id);
      if (idx >= 0) {
        const copy = [...curr];
        copy[idx] = parsed;
        return copy;
      }
      return [parsed, ...curr];
    });
    setUploadedCounts((curr) => ({ ...curr, [parsed.id]: reportsParsedCount }));
    const missing = reportsMissing
      .map((k) => MISSING_LABEL[k])
      .filter((m): m is string => Boolean(m));
    setUploadedNotices((curr) => ({
      ...curr,
      [parsed.id]: { warnings, missing },
    }));
    setSelectedId(parsed.id);
  };

  return (
    <div className="min-h-full bg-zinc-50">
      <header className="border-b border-zinc-200 bg-white">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
          <div className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-md bg-zinc-900 text-white">
              <Building size={16} strokeWidth={2} />
            </div>
            <span className="text-sm font-semibold text-zinc-900">Owner Dashboard</span>
          </div>
          <div className="flex items-center gap-3">
            <ManageReportsButton
              uploaded={uploadedCount}
              total={REPORT_TOTAL}
              onParseSuccess={handleParseSuccess}
            />
            <PropertySwitcher
              properties={properties}
              selectedId={activeId}
              onSelect={setSelectedId}
              uploadedIds={uploadedIds}
            />
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-6 py-8 space-y-6">
        <DashboardHeader property={property} uploaded={uploadedCount} />
        {notices && (notices.warnings.length > 0 || notices.missing.length > 0) ? (
          <NoticeBanner notices={notices} />
        ) : null}
        <HeroRow property={property} />
        <OperationsRow property={property} />
        <FinancialStrip property={property} />
        <FinancialStripT12 property={property} />
      </main>
    </div>
  );
}

function NoticeBanner({ notices }: { notices: UploadNotices }) {
  const items = [...notices.warnings, ...notices.missing];
  return (
    <div
      role="status"
      className="flex items-start gap-2 rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-xs text-amber-900"
    >
      <Info size={14} strokeWidth={2} className="mt-0.5 shrink-0 text-amber-600" />
      <ul className="space-y-1">
        {items.map((msg, i) => (
          <li key={i}>{msg}</li>
        ))}
      </ul>
    </div>
  );
}
