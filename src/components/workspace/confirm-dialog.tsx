"use client";

import { useEffect, useRef } from "react";
import { AlertTriangle, Loader2, ShieldAlert } from "lucide-react";

type ConfirmDialogProps = {
  open: boolean;
  title: string;
  description: string;
  confirmLabel?: string;
  cancelLabel?: string;
  loading?: boolean;
  tone?: "danger" | "warning";
  onConfirm: () => void;
  onCancel: () => void;
};

export function ConfirmDialog({
  open,
  title,
  description,
  confirmLabel = "Delete",
  cancelLabel = "Cancel",
  loading = false,
  tone = "danger",
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const cancelRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    const previous = document.activeElement as HTMLElement | null;
    cancelRef.current?.focus();
    return () => previous?.focus();
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !loading) onCancel();
      if (event.key !== "Tab") return;
      const focusable = dialogRef.current?.querySelectorAll<HTMLElement>(
        'button:not([disabled]), [href], input, textarea, select, [tabindex]:not([tabindex="-1"])',
      );
      if (!focusable || focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [open, loading, onCancel]);

  if (!open) return null;

  const warning = tone === "warning";
  const Icon = warning ? ShieldAlert : AlertTriangle;

  return (
    <div
      className="fixed inset-0 z-[70] flex items-center justify-center px-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="confirm-title"
      aria-describedby="confirm-description"
    >
      <button
        type="button"
        className="absolute inset-0 cursor-default bg-ink/25 backdrop-blur-[2px]"
        onClick={() => !loading && onCancel()}
        aria-label="Close dialog"
      />
      <div
        ref={dialogRef}
        className="animate-rise relative w-full max-w-sm rounded-2xl border border-line bg-surface p-5 shadow-[0_30px_80px_-30px_rgba(33,31,27,0.45)]"
      >
        <div
          className={
            warning
              ? "flex size-10 items-center justify-center rounded-full bg-amber-50 text-amber-700"
              : "flex size-10 items-center justify-center rounded-full bg-red-50 text-red-600"
          }
        >
          <Icon className="size-[18px]" />
        </div>
        <h2
          id="confirm-title"
          className="mt-4 font-serif text-[25px] leading-tight tracking-tight text-ink"
        >
          {title}
        </h2>
        <p id="confirm-description" className="mt-2 text-[13px] leading-6 text-ink-soft">
          {description}
        </p>
        <div className="mt-6 flex justify-end gap-2">
          <button
            ref={cancelRef}
            type="button"
            onClick={onCancel}
            disabled={loading}
            className="h-9 rounded-lg px-3.5 text-[12.5px] font-medium text-ink-soft transition hover:bg-paper disabled:opacity-60"
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={loading}
            className={
              warning
                ? "flex h-9 items-center gap-1.5 rounded-lg bg-ink px-3.5 text-[12.5px] font-medium text-white transition hover:bg-[#35312a] disabled:opacity-60"
                : "flex h-9 items-center gap-1.5 rounded-lg bg-red-600 px-3.5 text-[12.5px] font-medium text-white transition hover:bg-red-700 disabled:opacity-60"
            }
          >
            {loading && <Loader2 className="size-3.5 animate-spin" />}
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
