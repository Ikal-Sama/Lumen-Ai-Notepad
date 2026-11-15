"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  ChevronDown,
  FileText,
  Loader2,
  Lock,
  LogOut,
  Plus,
  Search,
  UserPlus,
  X,
} from "lucide-react";

import { Brand } from "@/components/brand";
import { authClient } from "@/lib/auth-client";
import type { Note, WorkspaceUser } from "@/lib/types";
import {
  cn,
  formatNoteDate,
  getSnippet,
  initials,
} from "@/lib/utils";

type NoteSidebarProps = {
  notes: Note[];
  selectedId: string | null;
  user: WorkspaceUser;
  creating: boolean;
  mobileOpen: boolean;
  onClose: () => void;
  onCreate: () => void;
  onSelect: (id: string) => void;
};

export function NoteSidebar({
  notes,
  selectedId,
  user,
  creating,
  mobileOpen,
  onClose,
  onCreate,
  onSelect,
}: NoteSidebarProps) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [signingOut, setSigningOut] = useState(false);
  const [accountOpen, setAccountOpen] = useState(false);
  const accountRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    function onPointerDown(event: MouseEvent) {
      if (!accountRef.current?.contains(event.target as Node)) {
        setAccountOpen(false);
      }
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setAccountOpen(false);
    }
    if (accountOpen) {
      document.addEventListener("mousedown", onPointerDown);
      document.addEventListener("keydown", onKeyDown);
    }
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [accountOpen]);

  const filteredNotes = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return notes;
    return notes.filter(
      (note) =>
        note.title.toLowerCase().includes(needle) ||
        note.content.toLowerCase().includes(needle),
    );
  }, [notes, query]);

  async function handleSignOut() {
    setSigningOut(true);
    try {
      await authClient.signOut();
      router.push("/sign-in");
      router.refresh();
    } finally {
      setSigningOut(false);
      setAccountOpen(false);
    }
  }

  function handleAddAccount() {
    setAccountOpen(false);
    router.push("/sign-in");
  }

  return (
    <aside
      className={cn(
        "w-[292px] shrink-0 flex-col border-r border-line bg-[#f7f4ed]",
        mobileOpen
          ? "fixed inset-y-0 left-0 z-50 flex shadow-2xl"
          : "hidden md:flex",
      )}
    >
      <div className="flex items-center justify-between px-5 pb-4 pt-5">
        <Brand />
        <button
          type="button"
          onClick={onClose}
          className="grid size-8 place-items-center rounded-lg text-muted transition hover:bg-white/70 hover:text-ink md:hidden"
          aria-label="Close notes sidebar"
        >
          <X className="size-4" />
        </button>
      </div>

      <div className="px-4">
        <button
          type="button"
          onClick={onCreate}
          disabled={creating}
          className="group flex h-10 w-full items-center justify-center gap-2 rounded-xl bg-ink text-[12.5px] font-medium text-surface shadow-sm transition hover:bg-[#37332c] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-accent/20 disabled:opacity-70"
        >
          {creating ? (
            <Loader2 className="size-4 animate-spin" />
          ) : (
            <Plus className="size-4 transition-transform group-hover:rotate-90" />
          )}
          New note
        </button>

        <div className="relative mt-3">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-3.5 -translate-y-1/2 text-muted" />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search notes"
            aria-label="Search notes"
            className="h-9 w-full rounded-lg border border-transparent bg-white/55 pl-8 pr-8 text-[12.5px] text-ink outline-none transition placeholder:text-muted/80 focus:border-line-strong focus:bg-white/80 focus:ring-2 focus:ring-accent/10"
          />
          {query && (
            <button
              type="button"
              onClick={() => setQuery("")}
              className="absolute right-2 top-1/2 grid size-5 -translate-y-1/2 place-items-center rounded text-muted transition hover:text-ink"
              aria-label="Clear search"
            >
              <X className="size-3" />
            </button>
          )}
        </div>
      </div>

      <div className="flex items-center justify-between px-5 pb-2 pt-6">
        <span className="text-[10.5px] font-medium uppercase tracking-[0.2em] text-muted">
          {query ? "Results" : "Your notes"}
        </span>
        <span className="rounded-full bg-white/60 px-2 py-0.5 text-[10px] font-medium tabular-nums text-muted">
          {filteredNotes.length}
        </span>
      </div>

      <nav className="flex-1 overflow-y-auto px-3 pb-3" aria-label="Notes">
        <div className="space-y-1">
          {filteredNotes.map((note, index) => {
            const active = note.id === selectedId;
            return (
              <button
                key={note.id}
                type="button"
                onClick={() => onSelect(note.id)}
                aria-current={active ? "true" : undefined}
                className={cn(
                  "group relative w-full rounded-xl px-3 py-3 text-left transition duration-150",
                  active
                    ? "bg-surface shadow-[0_1px_0_rgba(33,31,27,0.04),0_8px_20px_-14px_rgba(33,31,27,0.25)] ring-1 ring-line"
                    : "hover:bg-white/55",
                )}
                style={{ animationDelay: `${Math.min(index, 6) * 30}ms` }}
              >
                {active && (
                  <span className="absolute bottom-3 left-0 top-3 w-[3px] rounded-full bg-accent" />
                )}
                <div className="flex items-baseline justify-between gap-2">
                  <span
                    className={cn(
                      "truncate text-[13px] font-medium",
                      active ? "text-ink" : "text-ink-soft group-hover:text-ink",
                    )}
                  >
                    {note.title.trim() || "Untitled note"}
                  </span>
                  <span className="flex shrink-0 items-center gap-1">
                    {(note.encryptionVersion ?? 0) > 0 && (
                      <Lock className="size-3 text-muted" aria-label="Encrypted note" />
                    )}
                    <span
                      className="text-[10px] tabular-nums text-muted"
                      suppressHydrationWarning
                    >
                      {formatNoteDate(note.updatedAt)}
                    </span>
                  </span>
                </div>
                <p className="mt-1 line-clamp-2 text-[11.5px] leading-[1.55] text-ink-soft/65">
                  {(note.encryptionVersion ?? 0) > 0 && note.decrypted === false
                    ? "Encrypted note — unlock to view"
                    : getSnippet(note.content)}
                </p>
              </button>
            );
          })}
        </div>

        {filteredNotes.length === 0 && (
          <div className="mx-1 mt-4 rounded-xl border border-dashed border-line-strong/70 bg-white/30 px-5 py-8 text-center">
            <span className="mx-auto grid size-9 place-items-center rounded-full bg-white/80 text-muted">
              <FileText className="size-4" />
            </span>
            <p className="mt-3 text-[12.5px] font-medium text-ink-soft">
              {query ? "No matching notes" : "A blank page awaits"}
            </p>
            <p className="mt-1 text-[11.5px] leading-5 text-muted">
              {query
                ? "Try a different word or phrase."
                : "Create a note or ask the AI to start one for you."}
            </p>
          </div>
        )}
      </nav>

      <div className="border-t border-line/80 p-3">
        <div ref={accountRef} className="relative">
          {accountOpen && (
            <div className="absolute bottom-[calc(100%+8px)] left-0 right-0 z-20 overflow-hidden rounded-xl border border-line bg-surface shadow-[0_12px_32px_-12px_rgba(33,31,27,0.28)]">
              <div className="border-b border-line/80 px-3 py-3">
                <p className="text-[11px] font-medium uppercase tracking-[0.14em] text-muted">
                  Signed in as
                </p>
                <div className="mt-2 flex items-center gap-2.5">
                  {user.image ? (
                    <img
                      src={user.image}
                      alt={user.name || "Profile"}
                      className="size-9 shrink-0 rounded-full object-cover ring-1 ring-line"
                      referrerPolicy="no-referrer"
                    />
                  ) : (
                    <span className="grid size-9 shrink-0 place-items-center rounded-full bg-gradient-to-br from-accent to-[#8b7cf6] text-[11px] font-semibold text-white shadow-sm">
                      {initials(user.name) || "U"}
                    </span>
                  )}
                  <div className="min-w-0">
                    <p className="truncate text-[13px] font-medium text-ink">
                      {user.name || "Account"}
                    </p>
                    <p className="truncate text-[11px] text-muted">{user.email}</p>
                  </div>
                </div>
              </div>
              <div className="p-1.5">
                <button
                  type="button"
                  onClick={handleAddAccount}
                  className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-[12.5px] text-ink-soft transition hover:bg-[#f7f4ed] hover:text-ink"
                >
                  <UserPlus className="size-4 text-muted" />
                  Add account
                </button>
                <button
                  type="button"
                  onClick={handleAddAccount}
                  className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-[12.5px] text-ink-soft transition hover:bg-[#f7f4ed] hover:text-ink"
                >
                  <UserPlus className="size-4 text-muted" />
                  Switch account
                </button>
                <button
                  type="button"
                  onClick={handleSignOut}
                  disabled={signingOut}
                  className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-[12.5px] text-ink-soft transition hover:bg-[#f7f4ed] hover:text-ink disabled:opacity-60"
                >
                  {signingOut ? (
                    <Loader2 className="size-4 animate-spin text-muted" />
                  ) : (
                    <LogOut className="size-4 text-muted" />
                  )}
                  Sign out
                </button>
              </div>
            </div>
          )}

          <button
            type="button"
            onClick={() => setAccountOpen((open) => !open)}
            className={cn(
              "flex w-full items-center gap-2.5 rounded-xl px-2 py-1.5 text-left transition hover:bg-white/70",
              accountOpen && "bg-white/80 ring-1 ring-line",
            )}
            aria-haspopup="menu"
            aria-expanded={accountOpen}
            aria-label="Account menu"
          >
            {user.image ? (
              <img
                src={user.image}
                alt={user.name || "Profile"}
                className="size-9 shrink-0 rounded-full object-cover ring-1 ring-line"
                referrerPolicy="no-referrer"
              />
            ) : (
              <span className="grid size-9 shrink-0 place-items-center rounded-full bg-gradient-to-br from-accent to-[#8b7cf6] text-[11px] font-semibold text-white shadow-sm">
                {initials(user.name) || "U"}
              </span>
            )}
            <div className="min-w-0 flex-1">
              <p className="truncate text-[12.5px] font-medium text-ink">
                {user.name || "Account"}
              </p>
              <p className="truncate text-[10.5px] text-muted">{user.email}</p>
            </div>
            <ChevronDown
              className={cn(
                "size-4 shrink-0 text-muted transition-transform",
                accountOpen && "rotate-180",
              )}
            />
          </button>
        </div>
      </div>
    </aside>
  );
}
