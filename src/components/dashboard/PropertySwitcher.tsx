"use client";

import { useEffect, useRef, useState } from "react";
import { Building2, Check, ChevronDown, Plus, Trash2 } from "lucide-react";
import { AddPropertyDialog } from "@/components/dashboard/AddPropertyDialog";
import { ConfirmDeleteDialog } from "@/components/dashboard/ConfirmDeleteDialog";
import type { PropertyRecord } from "@/lib/properties";

interface PropertySwitcherProps {
  properties: PropertyRecord[];
  activeId: string | null;
  onSelect: (id: string) => void;
  onDelete: (id: string) => void;
  onCreated: (id: string) => void;
}

export function PropertySwitcher({
  properties,
  activeId,
  onSelect,
  onDelete,
  onCreated,
}: PropertySwitcherProps) {
  const [open, setOpen] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<PropertyRecord | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const active = properties.find((p) => p.id === activeId) ?? null;

  // Click-outside dismiss. We listen on the document and bail if the click
  // landed inside the popover container. The Add / Confirm dialogs render
  // outside this container (in <dialog> portals), so they're naturally
  // ignored.
  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (!containerRef.current) return;
      if (!containerRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  return (
    <div ref={containerRef} className="relative">
      <span className="mr-2 text-xs uppercase tracking-wide text-zinc-500">
        Property
      </span>
      <button
        type="button"
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className="inline-flex max-w-[16rem] items-center gap-2 rounded-md border border-zinc-300 bg-white px-3 py-1.5 text-sm font-medium text-zinc-900 shadow-sm hover:bg-zinc-50 focus:outline-none focus:ring-1 focus:ring-zinc-500"
      >
        <Building2 size={14} strokeWidth={1.75} className="shrink-0 text-zinc-500" />
        <span className="truncate">{active ? active.property.name : "No property selected"}</span>
        <ChevronDown size={14} strokeWidth={2} className="shrink-0 text-zinc-500" />
      </button>

      {open ? (
        <div
          role="listbox"
          className="absolute right-0 z-30 mt-2 w-72 overflow-hidden rounded-md border border-zinc-200 bg-white shadow-lg"
        >
          {properties.length === 0 ? (
            <div className="px-3 py-3 text-xs text-zinc-500">
              No properties — add one to get started.
            </div>
          ) : (
            <ul className="max-h-72 overflow-y-auto">
              {properties.map((p) => (
                <li key={p.id} className="group">
                  <div
                    className={
                      "flex items-center gap-2 px-3 py-2 text-sm " +
                      (p.id === activeId ? "bg-zinc-50" : "hover:bg-zinc-50")
                    }
                  >
                    <button
                      type="button"
                      role="option"
                      aria-selected={p.id === activeId}
                      onClick={() => {
                        onSelect(p.id);
                        setOpen(false);
                      }}
                      className="flex min-w-0 flex-1 items-center gap-2 text-left"
                    >
                      <Check
                        size={14}
                        strokeWidth={2.5}
                        className={
                          "shrink-0 " +
                          (p.id === activeId ? "text-emerald-600" : "text-transparent")
                        }
                      />
                      <span className="min-w-0 truncate text-zinc-900">
                        {p.property.name || "(unnamed)"}
                      </span>
                    </button>
                    <button
                      type="button"
                      aria-label={`Delete ${p.property.name}`}
                      onClick={() => {
                        setConfirmDelete(p);
                      }}
                      className="rounded-md p-1 text-zinc-400 opacity-0 hover:bg-zinc-100 hover:text-red-600 focus:opacity-100 group-hover:opacity-100"
                    >
                      <Trash2 size={14} strokeWidth={1.75} />
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}

          <div className="border-t border-zinc-200">
            <button
              type="button"
              onClick={() => {
                setOpen(false);
                setAddOpen(true);
              }}
              className="flex w-full items-center gap-2 px-3 py-2.5 text-sm font-medium text-zinc-900 hover:bg-zinc-50"
            >
              <Plus size={14} strokeWidth={2} className="text-zinc-500" />
              Add property
            </button>
          </div>
        </div>
      ) : null}

      {addOpen ? (
        <AddPropertyDialog
          open
          onClose={() => setAddOpen(false)}
          onCreated={(id) => {
            setAddOpen(false);
            onCreated(id);
          }}
        />
      ) : null}
      {confirmDelete ? (
        <ConfirmDeleteDialog
          open
          propertyName={confirmDelete.property.name}
          onClose={() => setConfirmDelete(null)}
          onConfirm={() => onDelete(confirmDelete.id)}
        />
      ) : null}
    </div>
  );
}
