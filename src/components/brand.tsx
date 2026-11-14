import Link from "next/link";

import { cn } from "@/lib/utils";

type BrandProps = {
  tone?: "dark" | "light";
  className?: string;
};

export function Brand({ tone = "dark", className }: BrandProps) {
  return (
    <Link
      href="/"
      className={cn("group flex items-center gap-2.5", className)}
      aria-label="Lumen home"
    >
      <span
        className={cn(
          "relative grid size-9 place-items-center rounded-xl shadow-sm transition-transform duration-300 group-hover:-rotate-3",
          tone === "dark"
            ? "bg-ink text-surface"
            : "bg-surface/10 text-white ring-1 ring-white/15",
        )}
      >
        <img
          src="/logo.png"
          alt="Lumen logo"
          className="size-[18px] rounded-lg object-cover"
        />
        <span
          className={cn(
            "absolute -right-0.5 -top-0.5 size-2 rounded-full bg-accent ring-2",
            tone === "dark" ? "ring-paper" : "ring-[#1d1b17]",
          )}
        />
      </span>
      <span
        className={cn(
          "font-serif text-[23px] leading-none tracking-tight",
          tone === "dark" ? "text-ink" : "text-white",
        )}
      >
        Lumen
      </span>
    </Link>
  );
}
