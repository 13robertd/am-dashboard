import { FileSpreadsheet } from "lucide-react";
import type { Property } from "@/types/portfolio";
import { Step } from "@/components/dashboard/FinancialStrip";
import { formatPercent } from "@/lib/format";
import {
  incomeT12,
  netCashFlowT12,
  noiT12,
  opexPercentT12,
  operatingExpensesT12,
} from "@/lib/metrics";

const isMultifamily = (p: Property) => p.units.length === 0 || p.units.length >= 5;

// Trailing-12 sibling of FinancialStrip. Mirrors its tile structure and
// typography so the two sections read as a pair. Deltas are intentionally
// omitted in this iteration — see the TODO in metrics.ts.
export function FinancialStripT12({ property }: { property: Property }) {
  // Single-family properties don't get the multi-tile flow strip in the
  // monthly section either; preserve that asymmetry here.
  if (!isMultifamily(property)) return null;

  const hasFinancials = property.monthlyFinancials.length > 0;

  if (!hasFinancials) {
    return (
      <div className="rounded-lg border border-zinc-200 bg-white p-5 shadow-sm">
        <div className="mb-3 text-xs font-medium uppercase tracking-wide text-zinc-500">
          Financials — trailing 12
        </div>
        <div className="flex items-center gap-3 rounded-md border border-zinc-100 bg-zinc-50/50 px-4 py-6 text-sm text-zinc-500">
          <FileSpreadsheet size={18} strokeWidth={1.5} className="shrink-0 text-zinc-400" />
          <span>Data needed — Upload Income Statement (Trailing 12) to show trailing-12 financials.</span>
        </div>
      </div>
    );
  }

  const income = incomeT12(property);
  const opex = operatingExpensesT12(property);
  const noi = noiT12(property);
  const cashFlow = netCashFlowT12(property);
  const opexPct = opexPercentT12(property);

  const flowSteps: Array<{
    label: string;
    value: number;
    tone: "neutral" | "subtract" | "positive" | "negative";
  }> = [
    { label: "Income", value: income, tone: "neutral" },
    { label: "OpEx", value: -opex, tone: "subtract" },
    { label: "NOI", value: noi, tone: "neutral" },
    {
      label: "Cash Flow",
      value: cashFlow,
      tone: cashFlow >= 0 ? "positive" : "negative",
    },
  ];

  return (
    <div className="rounded-lg border border-zinc-200 bg-white p-5 shadow-sm">
      <div className="mb-3 text-xs font-medium uppercase tracking-wide text-zinc-500">
        Financials — trailing 12
      </div>
      <div className="flex flex-wrap items-stretch gap-3">
        {flowSteps.map((step, i) => (
          <Step
            key={step.label}
            label={step.label}
            value={step.value}
            tone={step.tone}
            delta={null}
            polarity="normal"
            connector={i < flowSteps.length - 1}
          />
        ))}
        {/* Visual divider: OpEx % is a derived ratio, not the next step in
            the P&L flow, so the arrow flow ends here and the ratio sits
            slightly apart. */}
        <div
          aria-hidden
          className="mx-1 self-stretch border-l border-zinc-200"
        />
        <OpExPercentTile value={opexPct} />
      </div>
    </div>
  );
}

function OpExPercentTile({ value }: { value: number | null }) {
  return (
    <div className="flex min-w-[8.5rem] flex-1 flex-col rounded-md border border-zinc-100 bg-zinc-50/50 px-4 py-3">
      <div className="text-[11px] font-medium uppercase tracking-wide text-zinc-500">
        OpEx %
      </div>
      {value === null ? (
        <div className="mt-1 text-xs leading-snug text-zinc-500">
          Data needed — Upload Income Statement (Trailing 12) to show OpEx %.
        </div>
      ) : (
        <div className="mt-1 text-xl font-semibold tabular-nums text-zinc-900">
          {formatPercent(value, 1)}
        </div>
      )}
    </div>
  );
}
