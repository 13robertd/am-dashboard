import { format, parseISO } from "date-fns";

export function formatCurrency(n: number, opts: { compact?: boolean } = {}): string {
  if (opts.compact && Math.abs(n) >= 1000) {
    const thousands = n / 1000;
    const rounded = Math.abs(thousands) >= 100
      ? Math.round(thousands)
      : Math.round(thousands * 10) / 10;
    return `$${rounded}K`;
  }
  // Round to cents to test for whole-dollar amounts (avoids float noise like 49758.0000003).
  const cents = Math.round(n * 100);
  const isWholeDollar = cents % 100 === 0;
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: isWholeDollar ? 0 : 2,
    maximumFractionDigits: isWholeDollar ? 0 : 2,
  }).format(n);
}

// Kept as an alias for any callsite that wants explicit "use this for money"
// semantics. Now that formatCurrency drops .00 on whole dollars automatically,
// this is identical behavior.
export const formatCurrencyExact = formatCurrency;

// For aggregate KPIs (Income, OpEx, NOI, Cash Flow, Maintenance Spend) — always
// rounds to whole dollars, no cents. Per-tenant amounts use formatCurrency,
// which preserves cents when present.
export function formatCurrencyAggregate(n: number, opts: { compact?: boolean } = {}): string {
  if (opts.compact && Math.abs(n) >= 1000) {
    const thousands = n / 1000;
    const rounded = Math.abs(thousands) >= 100
      ? Math.round(thousands)
      : Math.round(thousands * 10) / 10;
    return `$${rounded}K`;
  }
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(n);
}

export function formatMonthShort(iso: string): string {
  return format(parseISO(iso), "MMM");
}

export function formatPercent(n: number, digits = 1): string {
  return `${n.toFixed(digits)}%`;
}

export function formatMonthYear(iso: string): string {
  return format(parseISO(iso), "MMM yyyy");
}

export function formatMonthYearLong(iso: string): string {
  return format(parseISO(iso), "MMMM yyyy");
}

export function formatLongDate(iso: string): string {
  return format(parseISO(iso), "MMMM d, yyyy");
}

export function formatShortDate(iso: string): string {
  return format(parseISO(iso), "MMM d, yyyy");
}
