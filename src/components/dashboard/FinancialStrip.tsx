import type { ReactNode } from "react";
import { ArrowRight } from "lucide-react";
import type { Property } from "@/types/portfolio";
import { formatCurrency } from "@/lib/format";
import {
  incomeThisMonth,
  netCashFlowThisMonth,
  noiThisMonth,
  operatingExpensesThisMonth,
} from "@/lib/metrics";

const isMultifamily = (p: Property) => p.units.length >= 5;

export function FinancialStrip({ property }: { property: Property }) {
  const income = incomeThisMonth(property);
  const opex = operatingExpensesThisMonth(property);
  const noi = noiThisMonth(property);
  const cashFlow = netCashFlowThisMonth(property);

  const steps = isMultifamily(property)
    ? [
        { label: "Income", value: income, tone: "neutral" as const },
        { label: "OpEx", value: -opex, tone: "subtract" as const },
        { label: "NOI", value: noi, tone: "neutral" as const },
        {
          label: "Cash Flow",
          value: cashFlow,
          tone: cashFlow >= 0 ? ("positive" as const) : ("negative" as const),
        },
      ]
    : [
        { label: "Income", value: income, tone: "neutral" as const },
        { label: "Expenses", value: -opex, tone: "subtract" as const },
        {
          label: "Cash Flow",
          value: cashFlow,
          tone: cashFlow >= 0 ? ("positive" as const) : ("negative" as const),
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
            connector={i < steps.length - 1}
          />
        ))}
      </div>
    </div>
  );
}

function Step({
  label,
  value,
  tone,
  connector,
}: {
  label: string;
  value: number;
  tone: "neutral" | "subtract" | "positive" | "negative";
  connector: boolean;
}) {
  let color = "text-zinc-900";
  if (tone === "subtract") color = "text-zinc-500";
  if (tone === "positive") color = "text-emerald-700";
  if (tone === "negative") color = "text-red-700";

  const display = tone === "subtract" ? `− ${formatCurrency(Math.abs(value))}` : formatCurrency(value);

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
      </div>
      {connectorEl}
    </>
  );
}
