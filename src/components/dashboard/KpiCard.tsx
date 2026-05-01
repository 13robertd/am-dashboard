import type { ReactNode } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

interface KpiCardProps {
  label: string;
  value: ReactNode;
  sub?: ReactNode;
  footer?: ReactNode;
}

export function KpiCard({ label, value, sub, footer }: KpiCardProps) {
  return (
    <Card className="flex flex-col">
      <CardHeader>
        <CardTitle>{label}</CardTitle>
      </CardHeader>
      <CardContent className="flex-1">
        <div className="text-3xl font-semibold tracking-tight text-zinc-900 tabular-nums">
          {value}
        </div>
        {sub ? <div className="mt-1 text-sm text-zinc-500">{sub}</div> : null}
      </CardContent>
      {footer ? (
        <div className="px-5 pb-4 text-xs text-zinc-500">{footer}</div>
      ) : null}
    </Card>
  );
}
