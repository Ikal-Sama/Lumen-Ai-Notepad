"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  AlertCircle,
  CheckCircle2,
  ChevronRight,
  Menu,
  Plus,
  Sparkles,
} from "lucide-react";

import { AiChatPanel } from "@/components/workspace/ai-chat-panel";
import { ConfirmDialog } from "@/components/workspace/confirm-dialog";
import { NoteEditor } from "@/components/workspace/note-editor";
import { NoteSidebar } from "@/components/workspace/note-sidebar";
import type { Note, WorkspaceUser } from "@/lib/types";
import { cn } from "@/lib/utils";

type WorkspaceProps = {
  user: WorkspaceUser;
  initialNotes: Note[];
};

type ToastState = {
  message: string;
  tone: "success" | "error";
};

export function Workspace({ user, initialNotes }: WorkspaceProps) {
  const [notes, setNotes] = useState<Note[]>(initialNotes);
  const [selectedId, setSelectedId] = useState<string | null>(
    initialNotes[0]?.id ?? null,
  );
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [aiClosed, setAiClosed] = useState(false);
  const [mobileAiOpen, setMobileAiOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<Note | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [toast, setToast] = useState<ToastState | null>(null);
  const [editorRevision, setEditorRevision] = useState(0);

  const toastTimer = useRef<number | null>(null);
  const flushNoteRef = useRef<(() => Promise<boolean>) | null>(null);
  const chatSendRef = useRef<((text: string) => void) | null>(null);

  const showToast = useCallback(
    (message: string, tone: ToastState["tone"] = "success") => {
      setToast({ message, tone });
      if (toastTimer.current) window.clearTimeout(toastTimer.current);
      toastTimer.current = window.setTimeout(() => setToast(null), 3400);
    },
    [],
  );

  useEffect(() => {
    return () => {
      if (toastTimer.current) window.clearTimeout(toastTimer.current);
    };
  }, []);

  const registerFlush = useCallback(
    (flush: (() => Promise<boolean>) | null) => {
      flushNoteRef.current = flush;
    },
    [],
  );

  const registerChatSend = useCallback(
    (send: ((text: string) => void) | null) => {
      chatSendRef.current = send;
    },
    [],
  );

  const flushActiveNote = useCallback(async () => {
    const flush = flushNoteRef.current;
    if (!flush) return true;
    return flush();
  }, []);

  const handleAiAction = useCallback((prompt: string) => {
    setAiClosed(false);
    setMobileAiOpen(true);
    chatSendRef.current?.(prompt);
  }, []);

  const selectedNote =
    notes.find((note) => note.id === selectedId) ?? null;

  const refreshNotes = useCallback(async (selectId?: string) => {
    const response = await fetch("/api/notes", { cache: "no-store" });
    if (!response.ok) throw new Error("Could not load notes.");
    const data = (await response.json()) as { notes: Note[] };
    setNotes(data.notes);
    if (selectId && data.notes.some((note) => note.id === selectId)) {
      setSelectedId(selectId);
    }
    return data.notes;
  }, []);

  async function handleCreateNote() {
    setCreating(true);
    try {
      const response = await fetch("/api/notes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: "Untitled note", content: "" }),
      });

      if (!response.ok) throw new Error("Could not create note.");

      const data = (await response.json()) as { note: Note };
      setNotes((current) => [data.note, ...current]);
      setSelectedId(data.note.id);
      setSidebarOpen(false);
      setMobileAiOpen(false);
    } catch {
      showToast("Couldn’t create a note. Please try again.", "error");
    } finally {
      setCreating(false);
    }
  }

  const handleSaveNote = useCallback(
    async (id: string, update: { title: string; content: string }) => {
      const response = await fetch(`/api/notes/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(update),
      });

      if (!response.ok) throw new Error("Could not save note.");

      const data = (await response.json()) as { note: Note };
      setNotes((current) =>
        current.map((note) => (note.id === id ? data.note : note)),
      );
      return data.note;
    },
    [],
  );

  async function handleConfirmDelete() {
    if (!deleteTarget) return;
    setDeleting(true);

    try {
      const response = await fetch(`/api/notes/${deleteTarget.id}`, {
        method: "DELETE",
      });

      if (!response.ok) throw new Error("Could not delete note.");

      const remaining = notes.filter((note) => note.id !== deleteTarget.id);
      setNotes(remaining);
      if (selectedId === deleteTarget.id) {
        setSelectedId(remaining[0]?.id ?? null);
      }
      setDeleteTarget(null);
      showToast("Note deleted");
    } catch {
      showToast("Couldn’t delete that note. Please try again.", "error");
    } finally {
      setDeleting(false);
    }
  }

  const handleAiNoteCreated = useCallback(
    async (noteId: string) => {
      try {
        await refreshNotes(noteId);
        setMobileAiOpen(false);
        showToast("Lumen AI saved a new note");
      } catch {
        showToast("A note was created, but the list didn’t refresh.", "error");
      }
    },
    [refreshNotes, showToast],
  );

  const handleAiNoteUpdated = useCallback(
    async (noteId: string) => {
      try {
        await refreshNotes();
        if (selectedId === noteId) {
          setEditorRevision((current) => current + 1);
        }
        showToast("Lumen AI updated your note");
      } catch {
        showToast("The note was updated, but the view didn’t refresh.", "error");
      }
    },
    [refreshNotes, selectedId, showToast],
  );

  const handleOpenNote = useCallback(
    async (noteId: string) => {
      setMobileAiOpen(false);
      if (notes.some((note) => note.id === noteId)) {
        setSelectedId(noteId);
        return;
      }

      try {
        await refreshNotes(noteId);
      } catch {
        showToast("Couldn’t open that note yet. Try again in a moment.", "error");
      }
    },
    [notes, refreshNotes, showToast],
  );

  function handleSelectNote(id: string) {
    setSelectedId(id);
    setSidebarOpen(false);
  }

  function openAiPanel() {
    setAiClosed(false);
    setMobileAiOpen(true);
  }

  return (
    <div className="flex h-dvh w-full overflow-hidden bg-paper">
      {sidebarOpen && (
        <button
          type="button"
          aria-label="Close notes sidebar"
          onClick={() => setSidebarOpen(false)}
          className="fixed inset-0 z-40 bg-ink/25 backdrop-blur-[2px] md:hidden"
        />
      )}

      <NoteSidebar
        notes={notes}
        selectedId={selectedId}
        user={user}
        creating={creating}
        mobileOpen={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
        onCreate={handleCreateNote}
        onSelect={handleSelectNote}
      />

      <main className="relative flex min-w-0 flex-1 flex-col bg-surface">
        {/* App bar */}
        <div className="flex h-[58px] shrink-0 items-center justify-between gap-3 border-b border-line/80 px-4 md:px-6">
          <div className="flex min-w-0 items-center gap-2.5">
            <button
              type="button"
              onClick={() => setSidebarOpen(true)}
              className="grid size-8 place-items-center rounded-lg text-ink-soft transition hover:bg-paper md:hidden"
              aria-label="Open notes sidebar"
            >
              <Menu className="size-[18px]" />
            </button>

            <span className="flex items-center gap-1.5 md:hidden">
              <img
                src="/logo.png"
                alt="Lumen logo"
                className="size-4 rounded object-cover"
              />
              <span className="font-serif text-[19px] leading-none">Lumen</span>
            </span>

            <div className="hidden min-w-0 items-center gap-1.5 text-[12px] md:flex">
              <span className="text-muted">Your notes</span>
              {selectedNote && (
                <>
                  <ChevronRight className="size-3.5 shrink-0 text-line-strong" />
                  <span className="truncate font-medium text-ink">
                    {selectedNote.title.trim() || "Untitled note"}
                  </span>
                </>
              )}
            </div>
          </div>

          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={openAiPanel}
              className="flex h-8 items-center gap-1.5 rounded-lg border border-line bg-surface px-2.5 text-[11.5px] font-medium text-ink-soft shadow-sm transition hover:border-line-strong hover:text-ink md:hidden"
            >
              <Sparkles className="size-3.5 text-accent" />
              AI
            </button>

            {aiClosed && (
              <button
                type="button"
                onClick={() => setAiClosed(false)}
                className="hidden h-8 items-center gap-1.5 rounded-lg border border-line bg-surface px-2.5 text-[11.5px] font-medium text-ink-soft shadow-sm transition hover:border-line-strong hover:text-ink md:flex"
              >
                <Sparkles className="size-3.5 text-accent" />
                Ask AI
              </button>
            )}
          </div>
        </div>

        {selectedNote ? (
          <NoteEditor
            key={selectedNote.id}
            note={selectedNote}
            revision={editorRevision}
            onSave={handleSaveNote}
            onRequestDelete={() => setDeleteTarget(selectedNote)}
            onAiAction={handleAiAction}
            onRegisterFlush={registerFlush}
          />
        ) : (
          <EmptyState onCreate={handleCreateNote} onOpenAi={openAiPanel} />
        )}
      </main>

      {mobileAiOpen && (
        <button
          type="button"
          aria-label="Close AI assistant"
          onClick={() => setMobileAiOpen(false)}
          className="fixed inset-0 z-40 bg-ink/25 backdrop-blur-[2px] md:hidden"
        />
      )}

      <AiChatPanel
        className={cn(
          mobileAiOpen
            ? "fixed inset-y-0 right-0 z-50 flex w-full shadow-2xl md:static md:z-auto md:shadow-none"
            : "hidden",
          aiClosed ? "md:hidden" : "md:flex",
        )}
        noteId={selectedId}
        onBeforeSend={flushActiveNote}
        onClose={() => {
          setAiClosed(true);
          setMobileAiOpen(false);
        }}
        onNoteCreated={handleAiNoteCreated}
        onNoteUpdated={handleAiNoteUpdated}
        onOpenNote={handleOpenNote}
        registerSend={registerChatSend}
      />

      <ConfirmDialog
        open={Boolean(deleteTarget)}
        title="Delete this note?"
        description={`“${deleteTarget?.title.trim() || "Untitled note"
          }” will be permanently removed. This can’t be undone.`}
        confirmLabel="Delete note"
        loading={deleting}
        onConfirm={handleConfirmDelete}
        onCancel={() => setDeleteTarget(null)}
      />

      {toast && (
        <div
          className={cn(
            "animate-rise fixed bottom-5 left-1/2 z-[80] flex -translate-x-1/2 items-center gap-2 rounded-full border px-4 py-2.5 text-[12px] font-medium shadow-xl",
            toast.tone === "success"
              ? "border-line bg-ink text-surface"
              : "border-red-200 bg-red-600 text-white",
          )}
          role="status"
        >
          {toast.tone === "success" ? (
            <CheckCircle2 className="size-3.5" />
          ) : (
            <AlertCircle className="size-3.5" />
          )}
          {toast.message}
        </div>
      )}
    </div>
  );
}

function EmptyState({
  onCreate,
  onOpenAi,
}: {
  onCreate: () => void;
  onOpenAi: () => void;
}) {
  return (
    <div className="flex flex-1 items-center justify-center overflow-y-auto px-6 py-12">
      <div className="animate-rise w-full max-w-md text-center">
        <div className="relative mx-auto w-fit">
          <span className="absolute inset-0 -z-10 scale-150 rounded-full bg-accent/10 blur-2xl" />
          <span className="grid size-14 place-items-center rounded-2xl border border-line bg-surface text-accent shadow-sm">
            <img
              src="/logo.png"
              alt="Lumen logo"
              className="size-6 rounded object-cover"
            />
          </span>
        </div>

        <h1 className="mt-6 font-serif text-[40px] leading-[1.05] tracking-tight text-ink">
          A quiet place for
          <br />
          loud ideas.
        </h1>
        <p className="mx-auto mt-3 max-w-sm text-[13px] leading-6 text-ink-soft">
          Select a note from the sidebar, begin a blank page, or ask Lumen AI to
          draft something with you.
        </p>

        <div className="mt-7 flex flex-col justify-center gap-2.5 sm:flex-row">
          <button
            type="button"
            onClick={onCreate}
            className="flex h-10 items-center justify-center gap-2 rounded-xl bg-ink px-4 text-[12.5px] font-medium text-surface shadow-sm transition hover:bg-[#37332c]"
          >
            <Plus className="size-4" />
            New note
          </button>
          <button
            type="button"
            onClick={onOpenAi}
            className="flex h-10 items-center justify-center gap-2 rounded-xl border border-line bg-surface px-4 text-[12.5px] font-medium text-ink-soft shadow-sm transition hover:border-line-strong hover:text-ink"
          >
            <Sparkles className="size-4 text-accent" />
            Ask Lumen AI
          </button>
        </div>

        <div className="mx-auto mt-10 h-px w-24 bg-line" />
        <p className="mt-4 text-[10.5px] uppercase tracking-[0.2em] text-muted">
          Write · Think · Let it save
        </p>
      </div>
    </div>
  );
}
