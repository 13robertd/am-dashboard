"use client";

import type { Property } from "@/types/portfolio";
import { Select } from "@/components/ui/select";

interface PropertySwitcherProps {
  properties: Property[];
  selectedId: string;
  onSelect: (id: string) => void;
  uploadedIds?: ReadonlySet<string>;
}

export function PropertySwitcher({
  properties,
  selectedId,
  onSelect,
  uploadedIds,
}: PropertySwitcherProps) {
  const uploaded = properties.filter((p) => uploadedIds?.has(p.id));
  const sample = properties.filter((p) => !uploadedIds?.has(p.id));

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
        {uploaded.length > 0 ? (
          <optgroup label="Uploaded">
            {uploaded.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name} (Uploaded)
              </option>
            ))}
          </optgroup>
        ) : null}
        {uploaded.length > 0 ? (
          <optgroup label="Sample">
            {sample.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </optgroup>
        ) : (
          sample.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))
        )}
      </Select>
    </div>
  );
}
