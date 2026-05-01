import type { MomDelta } from "@/lib/metrics";
import { formatMonthShort } from "@/lib/format";

export type DeltaPolarity = "normal" | "inverted" | "neutral";

interface DeltaProps {
  delta: MomDelta | null;
  polarity: DeltaPolarity;
  className?: string;
}

export function Delta({ delta, polarity, className }: DeltaProps) {
  if (!delta) return null;

  const priorLabel = formatMonthShort(delta.priorMonth);

  if (delta.prior === 0) {
    return (
      <span className={`text-zinc-400 ${className ?? ""}`.trim()}>
        — vs {priorLabel}
      </span>
    );
  }

  const pct = ((delta.current - delta.prior) / Math.abs(delta.prior)) * 100;
  const abs = Math.abs(pct);

  if (abs < 0.5) {
    return (
      <span className={`text-zinc-400 ${className ?? ""}`.trim()}>
        — Flat vs {priorLabel}
      </span>
    );
  }

  const isPositiveChange = pct > 0;

  let displayPct: string;
  if (abs > 999) {
    displayPct = ">999%";
  } else if (abs >= 100) {
    displayPct = `${Math.round(abs)}%`;
  } else {
    displayPct = `${abs.toFixed(1)}%`;
  }

  const arrow = isPositiveChange ? "↑" : "↓";

  let color = "text-zinc-500";
  if (polarity === "normal") {
    color = isPositiveChange ? "text-emerald-700" : "text-red-700";
  } else if (polarity === "inverted") {
    color = isPositiveChange ? "text-red-700" : "text-emerald-700";
  }

  return (
    <span className={`${color} ${className ?? ""}`.trim()}>
      {arrow} {displayPct} vs {priorLabel}
    </span>
  );
}
