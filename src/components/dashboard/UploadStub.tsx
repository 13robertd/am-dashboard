"use client";

import { useRef, useState } from "react";
import { Upload, FileText } from "lucide-react";
import { Button } from "@/components/ui/button";

const REPORT_NAMES = [
  "Rent Roll",
  "Income Statement (Trailing 12)",
  "Expiring Leases",
  "Resident Aged Receivables",
  "Work Order Report",
];

export function UploadStub() {
  const fileRef = useRef<HTMLInputElement>(null);
  const [toast, setToast] = useState<string | null>(null);

  const showToast = () => {
    setToast("File upload is coming in v2 — using sample data for now.");
    window.setTimeout(() => setToast(null), 3500);
  };

  return (
    <div className="rounded-lg border border-dashed border-zinc-300 bg-zinc-50/60 p-5">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex gap-3">
          <Upload size={20} strokeWidth={1.5} className="mt-0.5 shrink-0 text-zinc-500" />
          <div>
            <p className="text-sm font-medium text-zinc-900">
              Drop your Entrata reports here
            </p>
            <p className="mt-0.5 text-xs text-zinc-500">
              {REPORT_NAMES.join(" · ")}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-3">
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
      </div>
      <input
        ref={fileRef}
        type="file"
        multiple
        className="hidden"
        onChange={showToast}
      />
      {toast ? (
        <div
          role="status"
          className="mt-3 rounded-md bg-zinc-900 px-3 py-2 text-xs text-white"
        >
          {toast}
        </div>
      ) : null}
    </div>
  );
}
