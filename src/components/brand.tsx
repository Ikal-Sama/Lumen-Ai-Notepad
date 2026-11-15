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
      <span className="relative inline-flex shrink-0 transition-transform duration-300 group-hover:-rotate-3">
        <img
          src="/logo.png"
          alt="Lumen logo"
          className={cn(
            "size-8 rounded-lg object-contain",
            tone === "light" && "drop-shadow-sm",
          )}
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
