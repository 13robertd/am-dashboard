"use client";

import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";

interface ConfirmDeleteDialogProps {
  open: boolean;
  propertyName: string;
  onClose: () => void;
  onConfirm: () => void;
}

export function ConfirmDeleteDialog({
  open,
  propertyName,
  onClose,
  onConfirm,
}: ConfirmDeleteDialogProps) {
  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="Delete property"
      description="This removes the property and all its uploaded reports from this browser. It cannot be undone."
    >
      <p className="text-sm text-zinc-700">
        Delete <span className="font-medium">{propertyName}</span>?
      </p>
      <div className="mt-4 flex items-center justify-end gap-2">
        <Button type="button" variant="ghost" onClick={onClose}>
          Cancel
        </Button>
        <Button
          type="button"
          variant="primary"
          className="bg-red-600 hover:bg-red-500 focus-visible:outline-red-600"
          onClick={() => {
            onConfirm();
            onClose();
          }}
        >
          Delete property
        </Button>
      </div>
    </Dialog>
  );
}
