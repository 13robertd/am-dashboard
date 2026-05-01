"use client";

import { useMemo, useState } from "react";
import { Building } from "lucide-react";
import { listProperties } from "@/lib/queries";
import { REPORT_TOTAL, reportsUploaded } from "@/lib/reports";
import { DashboardHeader } from "@/components/dashboard/DashboardHeader";
import { PropertySwitcher } from "@/components/dashboard/PropertySwitcher";
import { ManageReportsButton } from "@/components/dashboard/ManageReportsButton";
import { HeroRow } from "@/components/dashboard/HeroRow";
import { OperationsRow } from "@/components/dashboard/OperationsRow";
import { FinancialStrip } from "@/components/dashboard/FinancialStrip";

export default function HomePage() {
  const properties = useMemo(() => listProperties(), []);
  const [selectedId, setSelectedId] = useState<string>(properties[0]?.id ?? "");
  const property = properties.find((p) => p.id === selectedId) ?? properties[0];

  if (!property) {
    return <div className="p-8">No properties available.</div>;
  }

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
              uploaded={reportsUploaded(property)}
              total={REPORT_TOTAL}
            />
            <PropertySwitcher
              properties={properties}
              selectedId={property.id}
              onSelect={setSelectedId}
            />
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-6 py-8 space-y-6">
        <DashboardHeader property={property} />
        <HeroRow property={property} />
        <OperationsRow property={property} />
        <FinancialStrip property={property} />
      </main>
    </div>
  );
}
