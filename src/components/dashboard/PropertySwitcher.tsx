"use client";

import type { Property } from "@/types/portfolio";
import { Select } from "@/components/ui/select";

interface PropertySwitcherProps {
  properties: Property[];
  selectedId: string;
  onSelect: (id: string) => void;
}

export function PropertySwitcher({
  properties,
  selectedId,
  onSelect,
}: PropertySwitcherProps) {
  return (
    <div className="flex items-center gap-2">
      <label htmlFor="property-switcher" className="text-xs uppercase tracking-wide text-zinc-500">
        Property
      </label>
      <Select
        id="property-switcher"
        value={selectedId}
        onChange={(e) => onSelect(e.target.value)}
      >
        {properties.map((p) => (
          <option key={p.id} value={p.id}>
            {p.name}
          </option>
        ))}
      </Select>
    </div>
  );
}
