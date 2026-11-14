"use client";

import { useEffect } from "react";
import { AlertTriangle, Loader2 } from "lucide-react";

type ConfirmDialogProps = {
  open: boolean;
  title: string;
  description: string;
  confirmLabel?: string;
  loading?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
};

export function ConfirmDialog({
  open,
  title,
  description,
  confirmLabel = "Delete",
  loading = false,
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  useEffect(() => {
    if (!open) return;
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !loading) onCancel();
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [open, loading, onCancel]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[70] flex items-center justify-center px-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="confirm-title"
    >
      <button
        type="button"
        className="absolute inset-0 cursor-default bg-ink/25 backdrop-blur-[2px]"
        onClick={() => !loading && onCancel()}
        aria-label="Close dialog"
      />
      <div className="animate-rise relative w-full max-w-sm rounded-2xl border border-line bg-surface p-5 shadow-[0_30px_80px_-30px_rgba(33,31,27,0.45)]">
        <div className="flex size-10 items-center justify-center rounded-full bg-red-50 text-red-600">
          <AlertTriangle className="size-[18px]" />
        </div>
        <h2
          id="confirm-title"
          className="mt-4 font-serif text-[25px] leading-tight tracking-tight text-ink"
        >
          {title}
        </h2>
        <p className="mt-2 text-[13px] leading-6 text-ink-soft">{description}</p>
        <div className="mt-6 flex justify-end gap-2">
          <button
            type="button"
            onClick={onCancel}
            disabled={loading}
            className="h-9 rounded-lg px-3.5 text-[12.5px] font-medium text-ink-soft transition hover:bg-paper disabled:opacity-60"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={loading}
            className="flex h-9 items-center gap-1.5 rounded-lg bg-red-600 px-3.5 text-[12.5px] font-medium text-white transition hover:bg-red-700 disabled:opacity-60"
          >
            {loading && <Loader2 className="size-3.5 animate-spin" />}
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
