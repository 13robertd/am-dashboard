import { format, parseISO } from "date-fns";

export function formatCurrency(n: number, opts: { compact?: boolean } = {}): string {
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

export function formatCurrencyExact(n: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(n);
}

export function formatPercent(n: number, digits = 1): string {
  return `${n.toFixed(digits)}%`;
}

export function formatMonthYear(iso: string): string {
  return format(parseISO(iso), "MMM yyyy");
}

export function formatLongDate(iso: string): string {
  return format(parseISO(iso), "MMMM d, yyyy");
}

export function formatShortDate(iso: string): string {
  return format(parseISO(iso), "MMM d, yyyy");
}
