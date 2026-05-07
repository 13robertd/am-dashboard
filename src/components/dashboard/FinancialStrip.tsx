import type { ReactNode } from "react";
import { ArrowRight, FileSpreadsheet } from "lucide-react";
import type { Property } from "@/types/portfolio";
import { Delta, type DeltaPolarity } from "@/components/dashboard/Delta";
import { formatCurrencyAggregate } from "@/lib/format";
import {
  cashFlowDelta,
  incomeDelta,
  incomeThisMonth,
  type MomDelta,
  netCashFlowThisMonth,
  noiDelta,
  noiThisMonth,
  opexDelta,
  operatingExpensesThisMonth,
} from "@/lib/metrics";

const isMultifamily = (p: Property) => p.units.length === 0 || p.units.length >= 5;

interface StepDef {
  label: string;
  value: number;
  tone: "neutral" | "subtract" | "positive" | "negative";
  delta: MomDelta | null;
  polarity: DeltaPolarity;
}

export function FinancialStrip({ property }: { property: Property }) {
  const hasFinancials = property.monthlyFinancials.length > 0;

  if (!hasFinancials) {
    // Single placeholder spans the whole strip — four side-by-side
    // identical "Data needed" boxes is worse UX than one clean message
    // explaining what the strip will show once an Income Statement lands.
    return (
      <div className="rounded-lg border border-zinc-200 bg-white p-5 shadow-sm">
        <div className="mb-3 text-xs font-medium uppercase tracking-wide text-zinc-500">
          Financials — this month
        </div>
        <div className="flex items-center gap-3 rounded-md border border-zinc-100 bg-zinc-50/50 px-4 py-6 text-sm text-zinc-500">
          <FileSpreadsheet size={18} strokeWidth={1.5} className="shrink-0 text-zinc-400" />
          <span>Data needed — Upload Income Statement to show this month&apos;s financials.</span>
        </div>
      </div>
    );
  }

  const income = incomeThisMonth(property);
  const opex = operatingExpensesThisMonth(property);
  const noi = noiThisMonth(property);
  const cashFlow = netCashFlowThisMonth(property);

  const steps: StepDef[] = isMultifamily(property)
    ? [
        {
          label: "Income",
          value: income,
          tone: "neutral",
          delta: incomeDelta(property),
          polarity: "normal",
        },
        {
          label: "OpEx",
          value: -opex,
          tone: "subtract",
          delta: opexDelta(property),
          polarity: "inverted",
        },
        {
          label: "NOI",
          value: noi,
          tone: "neutral",
          delta: noiDelta(property),
          polarity: "normal",
        },
        {
          label: "Cash Flow",
          value: cashFlow,
          tone: cashFlow >= 0 ? "positive" : "negative",
          delta: cashFlowDelta(property),
          polarity: "normal",
        },
      ]
    : [
        {
          label: "Income",
          value: income,
          tone: "neutral",
          delta: incomeDelta(property),
          polarity: "normal",
        },
        {
          label: "Expenses",
          value: -opex,
          tone: "subtract",
          delta: opexDelta(property),
          polarity: "inverted",
        },
      ];

  return (
    <div className="rounded-lg border border-zinc-200 bg-white p-5 shadow-sm">
      <div className="mb-3 text-xs font-medium uppercase tracking-wide text-zinc-500">
        Financials — this month
      </div>
      <div className="flex flex-wrap items-stretch gap-3">
        {steps.map((step, i) => (
          <Step
            key={step.label}
            label={step.label}
            value={step.value}
            tone={step.tone}
            delta={step.delta}
            polarity={step.polarity}
            connector={i < steps.length - 1}
          />
        ))}
      </div>
    </div>
  );
}

export function Step({
  label,
  value,
  tone,
  delta,
  polarity,
  connector,
}: {
  label: string;
  value: number;
  tone: "neutral" | "subtract" | "positive" | "negative";
  delta: MomDelta | null;
  polarity: DeltaPolarity;
  connector: boolean;
}) {
  let color = "text-zinc-900";
  if (tone === "subtract") color = "text-zinc-500";
  if (tone === "positive") color = "text-emerald-700";
  if (tone === "negative") color = "text-red-700";

  const display =
    tone === "subtract"
      ? `− ${formatCurrencyAggregate(Math.abs(value))}`
      : formatCurrencyAggregate(value);

  let connectorEl: ReactNode = null;
  if (connector) {
    connectorEl = (
      <div className="flex items-center px-1 text-zinc-300">
        <ArrowRight size={16} strokeWidth={1.5} />
      </div>
    );
  }

  return (
    <>
      <div className="flex min-w-[8.5rem] flex-1 flex-col rounded-md border border-zinc-100 bg-zinc-50/50 px-4 py-3">
        <div className="text-[11px] font-medium uppercase tracking-wide text-zinc-500">
          {label}
        </div>
        <div className={`mt-1 text-xl font-semibold tabular-nums ${color}`}>
          {display}
        </div>
        {delta ? (
          <div className="mt-1 text-[11px]">
            <Delta delta={delta} polarity={polarity} />
          </div>
        ) : null}
      </div>
      {connectorEl}
    </>
  );
}
