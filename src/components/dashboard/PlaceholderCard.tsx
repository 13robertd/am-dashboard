import type { ComponentType } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

interface PlaceholderCardProps {
  label: string;
  message: string;
  icon: ComponentType<{ className?: string; size?: number; strokeWidth?: number }>;
}

export function PlaceholderCard({
  label,
  message,
  icon: Icon,
}: PlaceholderCardProps) {
  return (
    <Card className="flex flex-col border-dashed">
      <CardHeader>
        <CardTitle className="text-zinc-400">{label}</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-1 items-center gap-3">
        <Icon size={20} strokeWidth={1.5} className="text-zinc-400 shrink-0" />
        <p className="text-sm text-zinc-500 leading-snug">{message}</p>
      </CardContent>
    </Card>
  );
}
