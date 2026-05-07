"use client";

import { useSyncExternalStore } from "react";
import { Building, Info } from "lucide-react";
import { REPORT_TOTAL } from "@/lib/reports";
import {
  deleteProperty,
  getServerSnapshot,
  getSnapshot,
  saveReportsFor,
  setActiveProperty,
  subscribe,
} from "@/lib/properties";
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

// agedReceivables is intentionally omitted — the adapter already emits a
// more specific warning when it approximates balances from the Rent Roll.
const MISSING_LABEL: Record<string, string> = {
  incomeStatement: "No Income Statement uploaded — financials and NOI may show $0.",
  expiringLeases: "No Expiring Leases report uploaded — lease end dates come from the Rent Roll only.",
  workOrders: "No Work Order report uploaded — open work orders not shown.",
};

export default function HomePage() {
  // useSyncExternalStore makes the store SSR-safe: during hydration React
  // uses the server snapshot (an empty store) which matches what the server
  // rendered, then switches to the live client snapshot which has been
  // populated by the module's hydrate() call. The first useSyncExternalStore
  // call on the client triggers hydrate() inside getSnapshot.
  const store = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  const properties = store.properties;
  const activeId = store.activeId;
  const active = properties.find((p) => p.id === activeId) ?? null;

  const handleParseSuccess = (payload: ParseSuccessPayload) => {
    if (!activeId) return;
    saveReportsFor(activeId, {
      property: payload.property,
      reports: {
        reportsParsedCount: payload.reportsParsedCount,
        warnings: payload.warnings,
        missingReports: payload.reportsMissing,
      },
    });
  };

  const reports = active?.reports;
  const noticeItems = active
    ? [
        ...(reports?.warnings ?? []),
        ...(reports?.missingReports ?? [])
          .map((k) => MISSING_LABEL[k])
          .filter((m): m is string => Boolean(m)),
      ]
    : [];

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
            {active ? (
              <ManageReportsButton
                uploaded={reports?.reportsParsedCount ?? 0}
                total={REPORT_TOTAL}
                onParseSuccess={handleParseSuccess}
              />
            ) : null}
            <PropertySwitcher
              properties={properties}
              activeId={activeId}
              onSelect={setActiveProperty}
              onDelete={deleteProperty}
              onCreated={setActiveProperty}
            />
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-6 py-8 space-y-6">
        {active ? (
          <>
            <DashboardHeader
              property={active.property}
              uploaded={reports?.reportsParsedCount ?? 0}
            />
            {noticeItems.length > 0 ? <NoticeBanner items={noticeItems} /> : null}
            <HeroRow property={active.property} />
            <OperationsRow property={active.property} />
            <FinancialStrip property={active.property} />
            <FinancialStripT12 property={active.property} />
          </>
        ) : (
          <EmptyState />
        )}
      </main>
    </div>
  );
}

function EmptyState() {
  return (
    <div className="rounded-lg border border-dashed border-zinc-300 bg-white px-6 py-12 text-center">
      <Building size={28} strokeWidth={1.5} className="mx-auto text-zinc-400" />
      <h2 className="mt-3 text-base font-semibold text-zinc-900">
        No properties yet
      </h2>
      <p className="mt-1 text-sm text-zinc-500">
        Use the Property menu in the header to add your first property.
      </p>
    </div>
  );
}

function NoticeBanner({ items }: { items: string[] }) {
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
