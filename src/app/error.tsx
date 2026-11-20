"use client";

import { useEffect } from "react";
import { AlertTriangle, RotateCcw } from "lucide-react";

export default function Error({
  error,
  retry,
}: {
  error: unknown;
  retry: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="flex min-h-dvh items-center justify-center px-4">
      <div className="animate-rise w-full max-w-sm rounded-2xl border border-line bg-surface p-6 text-center shadow-sm">
        <span className="mx-auto grid size-10 place-items-center rounded-full bg-red-50 text-red-600">
          <AlertTriangle className="size-[18px]" />
        </span>
        <h1 className="mt-4 font-serif text-[25px] leading-tight tracking-tight text-ink">
          Something went wrong
        </h1>
        <p className="mt-2 text-[13px] leading-6 text-ink-soft">
          Your notes are safe. This view failed to load — try again.
        </p>
        <button
          type="button"
          onClick={() => retry()}
          className="mt-6 inline-flex h-9 items-center gap-1.5 rounded-lg bg-ink px-3.5 text-[12.5px] font-medium text-white transition hover:bg-[#35312a]"
        >
          <RotateCcw className="size-3.5" />
          Try again
        </button>
      </div>
    </div>
  );
}
