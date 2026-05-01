import type { MomDelta } from "@/lib/metrics";
import { formatCurrencyAggregate, formatMonthShort } from "@/lib/format";

export type DeltaPolarity = "normal" | "inverted" | "neutral";

interface DeltaProps {
  delta: MomDelta | null;
  polarity: DeltaPolarity;
  className?: string;
}

const FLAT_THRESHOLD = 0.25;

export function Delta({ delta, polarity, className }: DeltaProps) {
  if (!delta) return null;

  const priorLabel = formatMonthShort(delta.priorMonth);
  const wrap = (text: string, color: string) => (
    <span className={`${color} ${className ?? ""}`.trim()}>{text}</span>
  );

  if (delta.prior === 0) {
    return wrap(`— vs ${priorLabel}`, "text-zinc-400");
  }

  const diff = delta.current - delta.prior;
  const pct = (diff / Math.abs(delta.prior)) * 100;
  const abs = Math.abs(pct);

  if (abs < FLAT_THRESHOLD) {
    return wrap(`— Flat vs ${priorLabel}`, "text-zinc-400");
  }

  const isPositiveChange = diff > 0;
  const arrow = isPositiveChange ? "↑" : "↓";

  const signsOpposite =
    (delta.prior > 0 && delta.current < 0) ||
    (delta.prior < 0 && delta.current > 0);
  const useDollars = abs > 100 || signsOpposite;

  let body: string;
  if (useDollars) {
    const sign = isPositiveChange ? "+" : "-";
    body = `${sign}${formatCurrencyAggregate(Math.abs(diff))}`;
  } else {
    const rounded = Math.round(abs * 10) / 10;
    body = Number.isInteger(rounded)
      ? `${rounded}%`
      : `${rounded.toFixed(1)}%`;
  }

  let color = "text-zinc-500";
  if (polarity === "normal") {
    color = isPositiveChange ? "text-emerald-700" : "text-red-700";
  } else if (polarity === "inverted") {
    color = isPositiveChange ? "text-red-700" : "text-emerald-700";
  }

  return wrap(`${arrow} ${body} vs ${priorLabel}`, color);
}
