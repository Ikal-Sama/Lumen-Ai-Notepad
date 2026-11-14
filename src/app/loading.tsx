import { Loader2 } from "lucide-react";

export default function Loading() {
  return (
    <div className="flex h-dvh items-center justify-center bg-paper">
      <div className="flex items-center gap-2 text-[12px] font-medium text-muted">
        <span className="grid size-9 place-items-center rounded-xl bg-surface shadow-sm ring-1 ring-line">
          <Loader2 className="size-4 animate-spin text-accent" />
        </span>
        Opening your notebook…
      </div>
    </div>
  );
}
