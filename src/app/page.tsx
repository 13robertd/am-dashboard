"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Building, Info } from "lucide-react";
import { REPORT_TOTAL } from "@/lib/reports";
import {
  deleteProperty,
  listProperties,
  subscribe,
  type PropertyRecord,
} from "@/lib/properties";
import { DashboardHeader } from "@/components/dashboard/DashboardHeader";
import { PropertySwitcher } from "@/components/dashboard/PropertySwitcher";
import { ManageReportsButton } from "@/components/dashboard/ManageReportsButton";
import { HeroRow } from "@/components/dashboard/HeroRow";
import { OperationsRow } from "@/components/dashboard/OperationsRow";
import { FinancialStrip } from "@/components/dashboard/FinancialStrip";
import { FinancialStripT12 } from "@/components/dashboard/FinancialStripT12";

// Stage 3 page: client-side fetch + realtime refresh. Stage 4 will add the
// auth gate (middleware redirects unauthenticated visitors to /login). For
// now, an unauthenticated user just sees the empty state — Supabase RLS
// returns zero rows without a session.
//
// Stage 5+ will move the initial fetch into a Server Component to remove
// the first-paint flash; this version intentionally keeps everything
// client-side so /login + middleware can land in their own focused PR.
export default function HomePage() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const [properties, setProperties] = useState<PropertyRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  // Bumped after every mutation (create/delete/upload) so the effect below
  // refetches without us having to thread an imperative refresh callback
  // through every child component.
  const [refreshTick, setRefreshTick] = useState(0);

  // Active property is purely URL state via ?propertyId=. Falls back to the
  // first property in created_at order when the param is missing or stale.
  const activeIdParam = searchParams.get("propertyId");
  const active =
    properties.find((p) => p.id === activeIdParam) ?? properties[0] ?? null;
  const activeId = active?.id ?? null;

  // Initial fetch + realtime subscription. The subscribe callback bumps
  // `refreshTick`, which re-runs this effect and re-fetches. The
  // `cancelled` guard avoids racing setState calls when the user navigates
  // away mid-fetch.
  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const all = await listProperties();
        if (cancelled) return;
        setProperties(all);
        setError(null);
      } catch (err) {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : "Couldn't load properties.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    void load();
    const unsub = subscribe(() => setRefreshTick((n) => n + 1));
    return () => {
      cancelled = true;
      unsub();
    };
  }, [refreshTick]);

  const triggerRefresh = () => setRefreshTick((n) => n + 1);

  const setActive = (id: string) => {
    const params = new URLSearchParams(searchParams.toString());
    params.set("propertyId", id);
    // router.replace (not push) per spec — switching properties shouldn't
    // pollute browser history.
    router.replace(`/?${params.toString()}`);
  };

  const handleDelete = async (id: string) => {
    try {
      await deleteProperty(id);
      // If we just deleted the active one, drop the URL param so we fall
      // back to the first remaining property by created_at order.
      if (id === activeIdParam) {
        const params = new URLSearchParams(searchParams.toString());
        params.delete("propertyId");
        const qs = params.toString();
        router.replace(qs ? `/?${qs}` : "/");
      }
      triggerRefresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't delete property.");
    }
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
            {activeId ? (
              <ManageReportsButton
                propertyId={activeId}
                uploaded={active?.reports.length ?? 0}
                total={REPORT_TOTAL}
                onParseSuccess={triggerRefresh}
              />
            ) : null}
            <PropertySwitcher
              properties={properties}
              activeId={activeId}
              onSelect={setActive}
              onDelete={handleDelete}
              onCreated={(id) => {
                setActive(id);
                triggerRefresh();
              }}
            />
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-6 py-8 space-y-6">
        {loading ? (
          <LoadingState />
        ) : error ? (
          <ErrorState message={error} />
        ) : active ? (
          <ActiveDashboard record={active} />
        ) : (
          <EmptyState />
        )}
      </main>
    </div>
  );
}

function ActiveDashboard({ record }: { record: PropertyRecord }) {
  return (
    <>
      <DashboardHeader
        property={record.property}
        uploaded={record.reports.length}
      />
      {record.warnings.length > 0 ? (
        <NoticeBanner items={record.warnings} />
      ) : null}
      <HeroRow property={record.property} />
      <OperationsRow property={record.property} />
      <FinancialStrip property={record.property} />
      <FinancialStripT12 property={record.property} />
    </>
  );
}

function LoadingState() {
  return (
    <div className="rounded-lg border border-zinc-200 bg-white px-6 py-12 text-center text-sm text-zinc-500">
      Loading…
    </div>
  );
}

function ErrorState({ message }: { message: string }) {
  return (
    <div
      role="alert"
      className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800"
    >
      {message}
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
