"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import {
  createProperty,
  type ManualPropertyInput,
} from "@/lib/properties";

interface AddPropertyDialogProps {
  open: boolean;
  onClose: () => void;
  onCreated: (id: string) => void;
}

const EMPTY: ManualPropertyInput = {
  name: "",
  address: "",
  ownerName: "",
  city: "",
  state: "",
};

// Form state intentionally has no effect-based reset — the parent unmounts
// this component when `open` flips false (`{open ? <AddPropertyDialog … />}`),
// so a re-open creates a fresh instance with `EMPTY` state.
export function AddPropertyDialog({
  open,
  onClose,
  onCreated,
}: AddPropertyDialogProps) {
  const [form, setForm] = useState<ManualPropertyInput>(EMPTY);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const trimmedName = form.name.trim();
  const canSave = trimmedName.length > 0 && !submitting;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSave) return;
    setError(null);
    setSubmitting(true);
    try {
      const created = await createProperty(form);
      onCreated(created.id);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't create property.");
      setSubmitting(false);
    }
  };

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="Add property"
      description="Create a new property. You can upload reports later via Manage Reports."
    >
      <form onSubmit={handleSubmit} className="space-y-3">
        <Field
          label="Property name"
          required
          value={form.name}
          onChange={(v) => setForm((f) => ({ ...f, name: v }))}
          placeholder="e.g. The Pearl Tower"
          autoFocus
        />
        <Field
          label="Address"
          value={form.address ?? ""}
          onChange={(v) => setForm((f) => ({ ...f, address: v }))}
          placeholder="Street address"
        />
        <Field
          label="Owner entity"
          value={form.ownerName ?? ""}
          onChange={(v) => setForm((f) => ({ ...f, ownerName: v }))}
          placeholder="LLC or owner name"
        />
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-[1fr_6rem]">
          <Field
            label="City"
            value={form.city ?? ""}
            onChange={(v) => setForm((f) => ({ ...f, city: v }))}
            placeholder="Portland"
          />
          <Field
            label="State"
            value={form.state ?? ""}
            onChange={(v) => setForm((f) => ({ ...f, state: v.toUpperCase().slice(0, 2) }))}
            placeholder="OR"
          />
        </div>

        {error ? (
          <div
            role="alert"
            className="mt-3 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700"
          >
            {error}
          </div>
        ) : null}

        <div className="mt-4 flex items-center justify-end gap-2">
          <Button type="button" variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" variant="primary" disabled={!canSave}>
            {submitting ? "Adding…" : "Add property"}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}

interface FieldProps {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  required?: boolean;
  autoFocus?: boolean;
}

function Field({ label, value, onChange, placeholder, required, autoFocus }: FieldProps) {
  return (
    <label className="block">
      <span className="block text-xs font-medium uppercase tracking-wide text-zinc-500">
        {label}
        {required ? <span className="ml-1 text-red-600">*</span> : null}
      </span>
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        required={required}
        autoFocus={autoFocus}
        className="mt-1 w-full rounded-md border border-zinc-300 bg-white px-3 py-1.5 text-sm text-zinc-900 shadow-sm focus:border-zinc-500 focus:outline-none focus:ring-1 focus:ring-zinc-500"
      />
    </label>
  );
}
