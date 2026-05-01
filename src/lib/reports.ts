import type { Property } from "@/types/portfolio";

export const REPORT_TOTAL = 5;

const REPORTS_UPLOADED: Record<string, number> = {
  burnside: 4,
  maple: 2,
};

export function reportsUploaded(p: Property): number {
  return REPORTS_UPLOADED[p.id] ?? 0;
}
