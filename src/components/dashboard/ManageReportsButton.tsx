"use client";

import { useRef, useState } from "react";
import { FileText, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";

const REPORT_NAMES = [
  "Rent Roll",
  "Income Statement (Trailing 12)",
  "Expiring Leases",
  "Resident Aged Receivables",
  "Work Order Report",
];

interface ManageReportsButtonProps {
  uploaded: number;
  total: number;
}

export function ManageReportsButton({ uploaded, total }: ManageReportsButtonProps) {
  const [open, setOpen] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const showToast = () => {
    setToast("File upload is coming in v2 — using sample data for now.");
    window.setTimeout(() => setToast(null), 3500);
  };

  const isComplete = uploaded === total;

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
        onClose={() => setOpen(false)}
        title="Manage reports"
        description="Upload Entrata exports to drive this dashboard with your real data. v1 displays hand-authored sample data."
      >
        <div className="rounded-lg border border-dashed border-zinc-300 bg-zinc-50/60 p-4">
          <div className="flex gap-3">
            <Upload size={20} strokeWidth={1.5} className="mt-0.5 shrink-0 text-zinc-500" />
            <div className="flex-1">
              <p className="text-sm font-medium text-zinc-900">
                Drop your Entrata reports here
              </p>
              <ul className="mt-2 space-y-1 text-xs text-zinc-600">
                {REPORT_NAMES.map((name) => (
                  <li key={name} className="flex items-center gap-2">
                    <FileText size={12} strokeWidth={1.5} className="text-zinc-400" />
                    {name}
                  </li>
                ))}
              </ul>
            </div>
          </div>
          <div className="mt-4 flex items-center gap-3">
            <Button
              variant="secondary"
              onClick={() => fileRef.current?.click()}
            >
              <FileText size={14} strokeWidth={2} />
              Browse files
            </Button>
            <span className="text-xs text-zinc-400">or</span>
            <span className="rounded-md bg-emerald-50 px-2.5 py-1 text-xs font-medium text-emerald-700 ring-1 ring-inset ring-emerald-200">
              Using sample data
            </span>
          </div>
          <input
            ref={fileRef}
            type="file"
            multiple
            className="hidden"
            onChange={showToast}
          />
        </div>
        {toast ? (
          <div
            role="status"
            className="mt-3 rounded-md bg-zinc-900 px-3 py-2 text-xs text-white"
          >
            {toast}
          </div>
        ) : null}
      </Dialog>
    </>
  );
}
