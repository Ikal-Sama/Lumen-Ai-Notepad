import {
  ArrowUpRight,
  ListChecks,
  Lock,
  Sparkles,
  Undo2,
} from "lucide-react";

import { Brand } from "@/components/brand";

function LogoIcon({ className }: { className?: string }) {
  return <img src="/logo.png" alt="Lumen logo" className={className} />;
}

const features = [
  {
    icon: LogoIcon,
    title: "Write without friction",
    description: "A clean Markdown canvas that stays out of your way.",
  },
  {
    icon: Sparkles,
    title: "Think with an AI partner",
    description: "Ask questions, get summaries, and draft notes in seconds.",
  },
  {
    icon: ListChecks,
    title: "Turn talk into action",
    description: "Plans and checklists get saved straight to your notebook.",
  },
  {
    icon: Lock,
    title: "Encrypt notes you choose",
    description:
      "Protect sensitive note content with opt-in encryption and a recovery key.",
  },
  {
    icon: Undo2,
    title: "Undo and edit with confidence",
    description: "Step back changes in the editor and keep your writing in flow.",
  },
];

export default function AuthLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <div className="grid min-h-dvh lg:grid-cols-[1.05fr_1fr]">
      {/* Brand / story panel */}
      <aside className="relative hidden overflow-hidden bg-[#1d1b17] px-14 py-12 text-white lg:flex lg:flex-col">
        <div
          aria-hidden
          className="absolute inset-0 bg-[radial-gradient(circle_at_15%_10%,rgba(99,91,255,0.35),transparent_42%),radial-gradient(circle_at_85%_80%,rgba(190,156,104,0.25),transparent_45%)]"
        />
        <div
          aria-hidden
          className="absolute inset-0 opacity-[0.07] [background-image:linear-gradient(rgba(255,255,255,0.6)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.6)_1px,transparent_1px)] [background-size:56px_56px]"
        />
        <div className="relative z-10 flex items-center justify-between">
          <Brand tone="light" />
          <span className="rounded-full border border-white/15 bg-white/5 px-3 py-1 text-[11px] uppercase tracking-[0.18em] text-white/60">
            AI notebook
          </span>
        </div>

        <div className="relative z-10 my-auto max-w-lg py-16">
          <p className="mb-5 flex items-center gap-2 text-[11px] uppercase tracking-[0.24em] text-white/45">
            <span className="h-px w-7 bg-white/30" />
            A calmer way to think
          </p>
          <h1 className="font-serif text-[3.4rem] leading-[1.02] tracking-tight text-white">
            Think in ink.
            <br />
            <span className="text-[#b9b4ff]">Let AI do the filing.</span>
          </h1>
          <p className="mt-6 max-w-md text-[15px] leading-7 text-white/60">
            Lumen pairs a distraction-free notebook with an assistant that can
            capture an idea, structure a plan, and save it before the thought
            disappears.
          </p>

          <div className="mt-12 grid grid-cols-2 gap-x-6 gap-y-5">
            {features.map((feature) => (
              <div key={feature.title} className="flex gap-3">
                <span className="mt-0.5 grid size-8 shrink-0 place-items-center rounded-lg border border-white/10 bg-white/[0.06]">
                  <feature.icon className="size-4 text-[#b9b4ff]" />
                </span>
                <div>
                  <p className="text-[13.5px] font-medium text-white/90">
                    {feature.title}
                  </p>
                  <p className="mt-0.5 text-[12.5px] leading-5 text-white/45">
                    {feature.description}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="relative z-10 flex items-end justify-between gap-8">
          <div className="relative w-64 rotate-[-2deg] rounded-2xl border border-white/10 bg-[#fbf8f1] p-5 text-ink shadow-2xl">
            <p className="text-[10px] uppercase tracking-[0.18em] text-muted">
              Today’s note
            </p>
            <p className="mt-2 font-serif text-[21px] leading-tight tracking-tight">
              A quieter launch plan
            </p>
            <div className="mt-3 space-y-1.5">
              <div className="h-1.5 w-full rounded-full bg-line" />
              <div className="h-1.5 w-[86%] rounded-full bg-line" />
              <div className="h-1.5 w-[62%] rounded-full bg-line" />
            </div>
            <span className="mt-4 inline-flex items-center gap-1 rounded-full bg-accent-soft px-2 py-1 text-[10px] font-medium text-accent-deep">
              <Sparkles className="size-3" /> Drafted by AI
            </span>
          </div>
          <p className="max-w-[14rem] text-right text-[11px] leading-5 text-white/35">
            “The palest ink is better than the best memory.”
            <span className="mt-1 block text-white/25">— proverb</span>
          </p>
        </div>
      </aside>

      {/* Form panel */}
      <main className="relative flex min-h-dvh flex-col items-center justify-center px-5 pb-16 pt-24 sm:px-8 sm:pt-20 lg:py-10">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_80%_10%,rgba(79,70,229,0.06),transparent_35%)]"
        />
        <div className="absolute left-5 top-6 lg:hidden">
          <Brand />
        </div>
        <div className="relative z-10 w-full max-w-[420px]">{children}</div>
        <p className="absolute bottom-6 flex items-center gap-1 text-[11px] text-muted">
          Built with Next.js, Better Auth & the AI SDK
          <ArrowUpRight className="size-3" />
        </p>
      </main>
    </div>
  );
}
