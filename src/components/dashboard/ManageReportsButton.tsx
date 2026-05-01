"use client";

import { useRef, useState } from "react";
import { Check, FileText, Trash2, Upload, X } from "lucide-react";
import type { Property } from "@/types/portfolio";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import {
  detectEntrataReportType,
  EntrataParseError,
  parseEntrataReports,
  type EntrataReportType,
  type EntrataUpload,
} from "@/lib/adapters/entrata";

type SlotKey = keyof EntrataUpload;

const SLOT_ORDER: SlotKey[] = [
  "rentRoll",
  "incomeStatement",
  "expiringLeases",
  "agedReceivables",
  "workOrders",
];

const SLOT_LABELS: Record<SlotKey, string> = {
  rentRoll: "Rent Roll",
  incomeStatement: "Income Statement (Trailing 12)",
  expiringLeases: "Expiring Leases",
  agedReceivables: "Resident Aged Receivables",
  workOrders: "Work Order Report",
};

const SLOT_HINTS: Record<SlotKey, string> = {
  rentRoll: "Required — defines the unit list",
  incomeStatement: "Drives the financial strip and NOI",
  expiringLeases: "Enriches lease end dates",
  agedReceivables: "Drives delinquencies card",
  workOrders: "Accepted but not parsed yet (v3)",
};

type SlotState = "empty" | "uploaded" | "parsed" | "error";

const REPORT_TYPE_LABEL: Record<EntrataReportType, string> = {
  rentRoll: "a Rent Roll",
  incomeStatement: "an Income Statement",
  expiringLeases: "an Expiring Leases report",
  agedReceivables: "an Aged Receivables report",
  workOrders: "a Work Order report",
  unknown: "an unrecognised file",
};

export interface ParseSuccessPayload {
  property: Property;
  reportsParsedCount: number;
  warnings: string[];
  reportsMissing: Array<keyof EntrataUpload>;
}

interface ManageReportsButtonProps {
  uploaded: number;
  total: number;
  onParseSuccess: (payload: ParseSuccessPayload) => void;
}

export function ManageReportsButton({
  uploaded,
  total,
  onParseSuccess,
}: ManageReportsButtonProps) {
  const [open, setOpen] = useState(false);
  const [files, setFiles] = useState<Partial<Record<SlotKey, File>>>({});
  const [slotStates, setSlotStates] = useState<Partial<Record<SlotKey, SlotState>>>({});
  const [slotErrors, setSlotErrors] = useState<Partial<Record<SlotKey, string>>>({});
  const [globalError, setGlobalError] = useState<string | null>(null);
  const [parsing, setParsing] = useState(false);

  const isComplete = uploaded === total;
  const fileCount = Object.values(files).filter(Boolean).length;
  const canParse = fileCount > 0 && !parsing;

  const reset = () => {
    setFiles({});
    setSlotStates({});
    setSlotErrors({});
    setGlobalError(null);
    setParsing(false);
  };

  const handleClose = () => {
    setOpen(false);
    // Defer reset so the closing animation doesn't flash empty state.
    window.setTimeout(reset, 200);
  };

  const handleFile = (slot: SlotKey, file: File | null) => {
    setGlobalError(null);
    setFiles((prev) => {
      const next = { ...prev };
      if (file) next[slot] = file;
      else delete next[slot];
      return next;
    });
    setSlotStates((prev) => ({
      ...prev,
      [slot]: file ? "uploaded" : "empty",
    }));
    setSlotErrors((prev) => {
      const next = { ...prev };
      delete next[slot];
      return next;
    });
  };

  const handleParseAndApply = async () => {
    setGlobalError(null);
    setSlotErrors({});
    setParsing(true);

    // Read every supplied file's bytes once, then run wrong-slot detection
    // before the heavier parse so we can attribute mismatches to the offending
    // slot instead of crashing with a generic error.
    const upload: EntrataUpload = {};
    const buffers: Partial<Record<SlotKey, ArrayBuffer>> = {};
    for (const key of SLOT_ORDER) {
      const file = files[key];
      if (file) {
        const buf = await file.arrayBuffer();
        buffers[key] = buf;
        upload[key] = buf;
      }
    }

    const wrongSlot: Partial<Record<SlotKey, string>> = {};
    const nextStates: Partial<Record<SlotKey, SlotState>> = {};
    for (const key of SLOT_ORDER) {
      const buf = buffers[key];
      if (!buf) continue;
      // Skip detection for the workOrders slot — we don't parse it yet, so
      // there's nothing to validate against.
      if (key === "workOrders") {
        nextStates[key] = "uploaded";
        continue;
      }
      const detected = detectEntrataReportType(buf);
      if (detected !== "unknown" && detected !== key) {
        wrongSlot[key] = `This file looks like ${REPORT_TYPE_LABEL[detected]}. Move it to the matching slot.`;
        nextStates[key] = "error";
      } else {
        nextStates[key] = "uploaded";
      }
    }

    if (Object.keys(wrongSlot).length > 0) {
      setSlotErrors(wrongSlot);
      setSlotStates(nextStates);
      setGlobalError("One or more files are in the wrong slot — see the highlighted rows above.");
      setParsing(false);
      return;
    }

    try {
      const result = await parseEntrataReports(upload);
      // Mark every supplied slot as parsed for the brief moment before closing.
      const parsedStates: Partial<Record<SlotKey, SlotState>> = {};
      for (const key of SLOT_ORDER) {
        if (files[key]) parsedStates[key] = "parsed";
      }
      setSlotStates(parsedStates);
      onParseSuccess({
        property: result.property,
        reportsParsedCount: result.reportsParsed.length,
        warnings: result.warnings,
        reportsMissing: result.reportsMissing,
      });
      window.setTimeout(handleClose, 250);
    } catch (err) {
      const message =
        err instanceof EntrataParseError
          ? err.message
          : err instanceof Error
            ? err.message
            : "Couldn't parse the uploaded reports.";
      setGlobalError(message);
      setParsing(false);
    }
  };

  return (
    <>
      <Button
        type="button"
        variant="secondary"
        onClick={() => setOpen(true)}
        aria-label="Manage reports"
      >
        <Upload size={14} strokeWidth={2} />
        Manage Reports
        <span
          className={
            "ml-1 rounded-full px-1.5 py-0.5 text-[10px] font-semibold " +
            (isComplete
              ? "bg-emerald-100 text-emerald-700"
              : "bg-amber-100 text-amber-700")
          }
        >
          {uploaded}/{total}
        </span>
      </Button>

      <Dialog
        open={open}
        onClose={handleClose}
        title="Manage reports"
        description="Drop your Entrata XLSX exports into the matching slot, then parse to apply."
      >
        <div className="space-y-2">
          {SLOT_ORDER.map((key) => (
            <SlotRow
              key={key}
              slotKey={key}
              file={files[key]}
              state={slotStates[key] ?? "empty"}
              error={slotErrors[key]}
              onFile={(f) => handleFile(key, f)}
            />
          ))}
        </div>

        {globalError ? (
          <div
            role="alert"
            className="mt-3 flex items-start gap-2 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700"
          >
            <X size={14} strokeWidth={2} className="mt-0.5 shrink-0" />
            <span>{globalError}</span>
          </div>
        ) : null}

        <div className="mt-4 flex items-center justify-between gap-3">
          <span className="text-xs text-zinc-500">
            {fileCount === 0
              ? "Pick at least one report to begin."
              : `${fileCount} of ${SLOT_ORDER.length} report${fileCount === 1 ? "" : "s"} ready to parse.`}
          </span>
          <div className="flex items-center gap-2">
            <Button type="button" variant="ghost" onClick={handleClose}>
              Cancel
            </Button>
            <Button
              type="button"
              variant="primary"
              disabled={!canParse}
              onClick={handleParseAndApply}
            >
              {parsing ? "Parsing…" : "Parse and apply"}
            </Button>
          </div>
        </div>
      </Dialog>
    </>
  );
}

interface SlotRowProps {
  slotKey: SlotKey;
  file?: File;
  state: SlotState;
  error?: string;
  onFile: (file: File | null) => void;
}

function SlotRow({ slotKey, file, state, error, onFile }: SlotRowProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const isError = state === "error";

  return (
    <div
      className={
        "flex items-center gap-3 rounded-md border bg-white px-3 py-2.5 " +
        (isError ? "border-red-300" : "border-zinc-200")
      }
    >
      <FileText size={16} strokeWidth={1.5} className="shrink-0 text-zinc-400" />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium text-zinc-900">
            {SLOT_LABELS[slotKey]}
          </span>
          <StatusPill state={state} />
        </div>
        <div
          className={
            "mt-0.5 truncate text-xs " +
            (isError ? "text-red-600" : "text-zinc-500")
          }
        >
          {error ?? (file ? file.name : SLOT_HINTS[slotKey])}
        </div>
      </div>
      <input
        ref={inputRef}
        type="file"
        accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
        className="hidden"
        onChange={(e) => onFile(e.target.files?.[0] ?? null)}
      />
      {file ? (
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            className="rounded-md px-2 py-1 text-xs font-medium text-zinc-600 hover:bg-zinc-100"
          >
            Replace
          </button>
          <button
            type="button"
            aria-label={`Remove ${SLOT_LABELS[slotKey]}`}
            onClick={() => onFile(null)}
            className="rounded-md p-1 text-zinc-500 hover:bg-zinc-100 hover:text-red-600"
          >
            <Trash2 size={14} strokeWidth={1.5} />
          </button>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          className="rounded-md border border-zinc-200 bg-white px-2.5 py-1 text-xs font-medium text-zinc-700 shadow-sm hover:bg-zinc-50"
        >
          Choose file
        </button>
      )}
    </div>
  );
}

function StatusPill({ state }: { state: SlotState }) {
  if (state === "empty") return null;
  if (state === "parsed") {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-1.5 py-0.5 text-[10px] font-semibold text-emerald-700">
        <Check size={10} strokeWidth={2.5} />
        Parsed
      </span>
    );
  }
  if (state === "error") {
    return (
      <span className="rounded-full bg-red-50 px-1.5 py-0.5 text-[10px] font-semibold text-red-700">
        Error
      </span>
    );
  }
  return (
    <span className="rounded-full bg-amber-50 px-1.5 py-0.5 text-[10px] font-semibold text-amber-700">
      Ready
    </span>
  );
}
