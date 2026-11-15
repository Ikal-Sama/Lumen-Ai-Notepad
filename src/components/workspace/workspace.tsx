"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  AlertCircle,
  CheckCircle2,
  ChevronRight,
  Copy,
  KeyRound,
  Loader2,
  Lock,
  Menu,
  Plus,
  ShieldCheck,
  Sparkles,
} from "lucide-react";

import { AiChatPanel } from "@/components/workspace/ai-chat-panel";
import { ConfirmDialog } from "@/components/workspace/confirm-dialog";
import { NoteEditor } from "@/components/workspace/note-editor";
import { NoteSidebar } from "@/components/workspace/note-sidebar";
import { useE2ee } from "@/lib/e2ee/context";
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

function isEncryptedNote(note: Pick<Note, "encryptionVersion">) {
  return (note.encryptionVersion ?? 0) > 0;
}

export function Workspace({ user, initialNotes }: WorkspaceProps) {
  const e2ee = useE2ee();
  const [rawNotes, setRawNotes] = useState<Note[]>(initialNotes);
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

  // Encryption setup/unlock dialog state (on-demand)
  const [keyDialog, setKeyDialog] = useState<
    | { mode: "setup"; noteId?: string }
    | { mode: "unlock"; noteId?: string }
    | null
  >(null);
  const [keySecret, setKeySecret] = useState("");
  const [keyMode, setKeyMode] = useState<"password" | "recovery">("password");
  const [keyError, setKeyError] = useState<string | null>(null);
  const [keyLoading, setKeyLoading] = useState(false);
  const [recoveryKeyShown, setRecoveryKeyShown] = useState<string | null>(null);
  const pendingEncryptNoteIdRef = useRef<string | null>(null);

  const toastTimer = useRef<number | null>(null);
  const flushNoteRef = useRef<(() => Promise<boolean>) | null>(null);
  const chatSendRef = useRef<((text: string) => void) | null>(null);
  const { refreshBundle } = e2ee;

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

  useEffect(() => {
    void refreshBundle().catch(() => {});
  }, [refreshBundle]);

  const decryptNotes = useCallback(
    async (items: Note[]) => {
      return Promise.all(
        items.map(async (note) => {
          if (!isEncryptedNote(note)) {
            return { ...note, decrypted: true };
          }
          if (e2ee.dek && note.contentCiphertext && note.contentIv) {
            try {
              const content = await e2ee.decryptContent(note.contentCiphertext, note.contentIv);
              return { ...note, content, decrypted: true };
            } catch {
              return { ...note, content: "", decrypted: false };
            }
          }
          return { ...note, content: "", decrypted: false };
        }),
      );
    },
    [e2ee],
  );

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const decrypted = await decryptNotes(rawNotes);
      if (!cancelled) setNotes(decrypted);
    })();
    return () => {
      cancelled = true;
    };
  }, [rawNotes, decryptNotes]);

  const registerFlush = useCallback((flush: (() => Promise<boolean>) | null) => {
    flushNoteRef.current = flush;
  }, []);

  const registerChatSend = useCallback((send: ((text: string) => void) | null) => {
    chatSendRef.current = send;
  }, []);

  const flushActiveNote = useCallback(async () => {
    const flush = flushNoteRef.current;
    if (!flush) return true;
    return flush();
  }, []);

  const selectedNote = notes.find((note) => note.id === selectedId) ?? null;

  const refreshNotes = useCallback(
    async (selectId?: string) => {
      const response = await fetch("/api/notes", { cache: "no-store" });
      if (!response.ok) throw new Error("Could not load notes.");
      const data = (await response.json()) as { notes: Note[] };
      setRawNotes(data.notes);
      if (selectId && data.notes.some((note) => note.id === selectId)) {
        setSelectedId(selectId);
      }
      return data.notes;
    },
    [],
  );

  async function handleCreateNote() {
    setCreating(true);
    try {
      const response = await fetch("/api/notes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: "Untitled note", content: "", encryptionVersion: 0 }),
      });
      if (!response.ok) throw new Error("Could not create note.");
      const data = (await response.json()) as { note: Note };
      const plain: Note = { ...data.note, content: "", decrypted: true, encryptionVersion: 0 };
      setRawNotes((current) => [data.note, ...current]);
      setNotes((current) => [plain, ...current]);
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
      const current = rawNotes.find((n) => n.id === id) ?? notes.find((n) => n.id === id);
      const encrypted = current ? isEncryptedNote(current) : false;
      let body: Record<string, unknown> = { title: update.title };
      if (encrypted) {
        if (!e2ee.dek) throw new Error("Note is locked.");
        const enc = await e2ee.encryptContent(update.content);
        body = {
          title: update.title,
          encryptionVersion: 1,
          contentCiphertext: enc.ciphertext,
          contentIv: enc.iv,
        };
      } else {
        body = { title: update.title, content: update.content, encryptionVersion: 0 };
      }

      const response = await fetch(`/api/notes/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!response.ok) throw new Error("Could not save note.");
      const data = (await response.json()) as { note: Note };
      const plain: Note = {
        ...data.note,
        content: update.content,
        decrypted: true,
      };
      setRawNotes((cur) => cur.map((n) => (n.id === id ? data.note : n)));
      setNotes((cur) => cur.map((n) => (n.id === id ? plain : n)));
      return plain;
    },
    [e2ee, rawNotes, notes],
  );

  async function handleConfirmDelete() {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      const response = await fetch(`/api/notes/${deleteTarget.id}`, { method: "DELETE" });
      if (!response.ok) throw new Error("Could not delete note.");
      const remainingRaw = rawNotes.filter((note) => note.id !== deleteTarget.id);
      const remaining = notes.filter((note) => note.id !== deleteTarget.id);
      setRawNotes(remainingRaw);
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

  async function doEncryptNote(noteId: string) {
    const note = notes.find((n) => n.id === noteId);
    if (!note || isEncryptedNote(note)) return;
    if (!e2ee.dek) throw new Error("Encryption key not unlocked.");
    const content = note.content ?? "";
    const enc = await e2ee.encryptContent(content);
    const response = await fetch(`/api/notes/${noteId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        encryptionVersion: 1,
        contentCiphertext: enc.ciphertext,
        contentIv: enc.iv,
      }),
    });
    if (!response.ok) throw new Error("Could not encrypt note.");
    const data = (await response.json()) as { note: Note };
    const plain: Note = { ...data.note, content, decrypted: true };
    setRawNotes((cur) => cur.map((n) => (n.id === noteId ? data.note : n)));
    setNotes((cur) => cur.map((n) => (n.id === noteId ? plain : n)));
    showToast("Note encrypted");
  }

  function requestEncryptNote(noteId: string) {
    const note = notes.find((n) => n.id === noteId);
    if (!note || isEncryptedNote(note)) return;
    if (e2ee.dek) {
      void doEncryptNote(noteId).catch(() => showToast("Couldn’t encrypt note.", "error"));
      return;
    }
    // Need setup or unlock
    pendingEncryptNoteIdRef.current = noteId;
    if (!e2ee.hasBundle) {
      setKeyMode("password");
      setKeySecret("");
      setKeyError(null);
      setKeyDialog({ mode: "setup", noteId });
    } else {
      setKeyMode("password");
      setKeySecret("");
      setKeyError(null);
      setKeyDialog({ mode: "unlock", noteId });
    }
  }

  function requestUnlockForNote(noteId?: string) {
    if (!e2ee.hasBundle) {
      // Setup needed (e.g. encrypt flow) - but unlocking an encrypted note requires existing bundle
      setKeyMode("password");
      setKeySecret("");
      setKeyError(null);
      setKeyDialog({ mode: "setup", noteId });
      return;
    }
    setKeyMode("password");
    setKeySecret("");
    setKeyError(null);
    setKeyDialog({ mode: "unlock", noteId });
  }

  async function handleKeySubmit(e: React.FormEvent) {
    e.preventDefault();
    setKeyError(null);
    setKeyLoading(true);
    try {
      if (keyDialog?.mode === "setup") {
        if (keySecret.length < 8) {
          setKeyError("Enter your account password (at least 8 characters) to set up encryption.");
          return;
        }
        const recovery = await e2ee.setupWithPassword(keySecret);
        setRecoveryKeyShown(recovery);
        setKeySecret("");
        setKeyDialog(null);
        showToast("Encryption enabled");
        const pendingId = pendingEncryptNoteIdRef.current;
        pendingEncryptNoteIdRef.current = null;
        if (pendingId) {
          await doEncryptNote(pendingId);
        }
      } else if (keyMode === "recovery") {
        await e2ee.unlockRecovery(keySecret.trim());
        setKeySecret("");
        setKeyDialog(null);
        showToast("Encrypted notes unlocked");
        const pendingId = pendingEncryptNoteIdRef.current;
        pendingEncryptNoteIdRef.current = null;
        if (pendingId) {
          await doEncryptNote(pendingId).catch(() => showToast("Couldn’t encrypt note.", "error"));
        }
      } else {
        await e2ee.unlockPassword(keySecret);
        setKeySecret("");
        setKeyDialog(null);
        showToast("Encrypted notes unlocked");
        const pendingId = pendingEncryptNoteIdRef.current;
        pendingEncryptNoteIdRef.current = null;
        if (pendingId) {
          await doEncryptNote(pendingId).catch(() => showToast("Couldn’t encrypt note.", "error"));
        }
      }
    } catch {
      setKeyError(
        keyDialog?.mode === "setup"
          ? "Could not set up encryption. Please try again."
          : "Could not unlock. Check your password or recovery key.",
      );
    } finally {
      setKeyLoading(false);
    }
  }

  function handleAiAction(prompt: string) {
    if (selectedNote && isEncryptedNote(selectedNote) && !selectedNote.decrypted) {
      showToast("Unlock this encrypted note to use AI.", "error");
      requestUnlockForNote(selectedNote.id);
      return;
    }
    setAiClosed(false);
    setMobileAiOpen(true);
    chatSendRef.current?.(prompt);
  }

  function openAiPanel() {
    if (selectedNote && isEncryptedNote(selectedNote) && !selectedNote.decrypted) {
      showToast("Unlock this encrypted note to use AI.", "error");
      requestUnlockForNote(selectedNote.id);
      return;
    }
    setAiClosed(false);
    setMobileAiOpen(true);
  }

  const selectedIsEncrypted = selectedNote ? isEncryptedNote(selectedNote) : false;
  const selectedIsLocked = selectedNote ? selectedIsEncrypted && !selectedNote.decrypted : false;

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
              <img src="/logo.png" alt="Lumen logo" className="size-5 rounded-md object-contain" />
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
                  {selectedIsEncrypted && <Lock className="size-3 text-muted" />}
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
          selectedIsLocked ? (
            <LockedNoteScreen
              noteTitle={selectedNote.title}
              onUnlock={() => requestUnlockForNote(selectedNote.id)}
              ready={e2ee.ready}
            />
          ) : (
            <NoteEditor
              key={selectedNote.id}
              note={selectedNote}
              revision={editorRevision}
              isEncrypted={selectedIsEncrypted}
              onSave={handleSaveNote}
              onRequestDelete={() => setDeleteTarget(selectedNote)}
              onAiAction={handleAiAction}
              onRegisterFlush={registerFlush}
              onEncryptNote={
                !selectedIsEncrypted ? () => requestEncryptNote(selectedNote.id) : undefined
              }
            />
          )
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
        openNote={
          selectedNote && !selectedIsLocked
            ? { id: selectedNote.id, title: selectedNote.title, content: selectedNote.content }
            : null
        }
        openNoteIsEncrypted={selectedIsEncrypted}
        searchableNotes={notes
          .filter((n) => n.decrypted !== false)
          .map((n) => ({
            id: n.id,
            title: n.title,
            content: n.content,
            updatedAt: n.updatedAt,
          }))}
        onBeforeSend={flushActiveNote}
        onClose={() => {
          setAiClosed(true);
          setMobileAiOpen(false);
        }}
        onNoteCreated={handleAiNoteCreated}
        onNoteUpdated={handleAiNoteUpdated}
        onOpenNote={handleOpenNote}
        onApplyCreateNote={async ({ title, content }) => {
          // AI-created notes are plaintext by default unless created in context of encrypted workflow;
          // keep simple: create as plaintext note.
          const response = await fetch("/api/notes", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ title, content, encryptionVersion: 0 }),
          });
          if (!response.ok) throw new Error("Could not save note.");
          const data = (await response.json()) as { note: Note };
          return data.note.id;
        }}
        onApplyMutation={async ({ id, title, content }) => {
          // Save encrypted if target note is encrypted, else plaintext
          const target = rawNotes.find((n) => n.id === id) ?? notes.find((n) => n.id === id);
          const encrypted = target ? isEncryptedNote(target) : false;
          let body: Record<string, unknown>;
          if (encrypted) {
            if (!e2ee.dek) throw new Error("Note is locked.");
            const enc = await e2ee.encryptContent(content);
            body = { title, encryptionVersion: 1, contentCiphertext: enc.ciphertext, contentIv: enc.iv };
          } else {
            body = { title, content, encryptionVersion: 0 };
          }
          const response = await fetch(`/api/notes/${id}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(body),
          });
          if (!response.ok) throw new Error("Could not save note.");
        }}
        registerSend={registerChatSend}
      />

      <ConfirmDialog
        open={Boolean(deleteTarget)}
        title="Delete this note?"
        description={`“${
          deleteTarget?.title.trim() || "Untitled note"
        }” will be permanently removed. This can’t be undone.`}
        confirmLabel="Delete note"
        loading={deleting}
        onConfirm={handleConfirmDelete}
        onCancel={() => setDeleteTarget(null)}
      />

      {keyDialog && (
        <KeyDialog
          mode={keyDialog.mode}
          secret={keySecret}
          setSecret={setKeySecret}
          secretMode={keyMode}
          setSecretMode={setKeyMode}
          error={keyError}
          loading={keyLoading}
          onSubmit={handleKeySubmit}
          onClose={() => {
            if (keyLoading) return;
            setKeyDialog(null);
            setKeySecret("");
            setKeyError(null);
            pendingEncryptNoteIdRef.current = null;
          }}
        />
      )}

      {recoveryKeyShown && (
        <RecoveryKeyDialog
          recoveryKey={recoveryKeyShown}
          onDone={() => setRecoveryKeyShown(null)}
        />
      )}

      {!sidebarOpen && !mobileAiOpen && (
        <button
          type="button"
          onClick={() => void handleCreateNote()}
          disabled={creating}
          className="fixed bottom-5 right-5 z-[60] grid size-14 place-items-center rounded-full bg-ink text-surface shadow-lg transition hover:bg-[#37332c] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-accent/20 disabled:opacity-70 md:hidden"
          aria-label="Create new note"
          title="New note"
        >
          {creating ? <Loader2 className="size-5 animate-spin" /> : <Plus className="size-6" />}
        </button>
      )}

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

function LockedNoteScreen({
  noteTitle,
  onUnlock,
  ready,
}: {
  noteTitle: string;
  onUnlock: () => void;
  ready: boolean;
}) {
  return (
    <div className="flex flex-1 items-center justify-center overflow-y-auto px-6 py-12">
      <div className="w-full max-w-md rounded-2xl border border-line bg-paper/60 p-6 text-center shadow-sm">
        <div className="mx-auto mb-4 grid size-12 place-items-center rounded-xl bg-amber-50 text-amber-700">
          <Lock className="size-5" />
        </div>
        <h2 className="font-serif text-[28px] leading-tight tracking-tight text-ink">Encrypted note locked</h2>
        <p className="mt-2 text-[13px] leading-6 text-ink-soft">
          “{noteTitle.trim() || "Untitled note"}” is encrypted. Unlock your encryption key to view or edit its content.
        </p>
        <button
          type="button"
          onClick={onUnlock}
          disabled={!ready}
          className="mt-5 inline-flex h-10 items-center justify-center gap-2 rounded-xl bg-ink px-4 text-[12.5px] font-medium text-surface disabled:opacity-60"
        >
          <KeyRound className="size-4" /> Unlock
        </button>
      </div>
    </div>
  );
}

function KeyDialog({
  mode,
  secret,
  setSecret,
  secretMode,
  setSecretMode,
  error,
  loading,
  onSubmit,
  onClose,
}: {
  mode: "setup" | "unlock";
  secret: string;
  setSecret: (v: string) => void;
  secretMode: "password" | "recovery";
  setSecretMode: (v: "password" | "recovery") => void;
  error: string | null;
  loading: boolean;
  onSubmit: (e: React.FormEvent) => void;
  onClose: () => void;
}) {
  const isSetup = mode === "setup";
  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center px-4" role="dialog" aria-modal="true">
      <button type="button" className="absolute inset-0 bg-ink/25 backdrop-blur-[2px]" onClick={onClose} aria-label="Close dialog" />
      <form onSubmit={onSubmit} className="animate-rise relative w-full max-w-md rounded-2xl border border-line bg-surface p-5 shadow-[0_30px_80px_-30px_rgba(33,31,27,0.45)]">
        <div className="mb-3 grid size-10 place-items-center rounded-xl bg-accent-soft text-accent">
          {isSetup ? <ShieldCheck className="size-5" /> : <Lock className="size-5" />}
        </div>
        <h2 className="font-serif text-[25px] leading-tight tracking-tight text-ink">
          {isSetup ? "Set up note encryption" : "Unlock encrypted notes"}
        </h2>
        <p className="mt-2 text-[13px] leading-6 text-ink-soft">
          {isSetup
            ? "Enter your account password to create your encryption key. You’ll receive a one-time recovery key — save it. Without your password or recovery key, encrypted notes cannot be recovered."
            : secretMode === "recovery"
              ? "Enter your recovery key to unlock encrypted notes for this session."
              : "Enter your account password to unlock encrypted notes for this session."}
        </p>
        <label className="mt-4 block text-[12px] font-medium text-ink-soft">
          {isSetup || secretMode === "password" ? "Account password" : "Recovery key"}
          <input
            type={secretMode === "recovery" ? "text" : "password"}
            value={secret}
            onChange={(e) => setSecret(e.target.value)}
            className="mt-1.5 h-11 w-full rounded-xl border border-line bg-paper px-3.5 text-[13.5px] text-ink outline-none focus:border-accent/40 focus:ring-4 focus:ring-accent/10"
            autoComplete={secretMode === "recovery" ? "off" : "current-password"}
            required
          />
        </label>
        {error && (
          <div className="mt-3 flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 px-3 py-2.5 text-[12px] text-red-700">
            <AlertCircle className="mt-0.5 size-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}
        <div className="mt-5 flex items-center justify-between gap-2">
          {!isSetup ? (
            <button
              type="button"
              onClick={() => setSecretMode(secretMode === "password" ? "recovery" : "password")}
              className="text-[12px] font-medium text-accent-deep hover:underline"
            >
              {secretMode === "password" ? "Use recovery key" : "Use password"}
            </button>
          ) : <span />}
          <div className="flex gap-2">
            <button type="button" onClick={onClose} disabled={loading} className="h-9 rounded-lg px-3.5 text-[12.5px] font-medium text-ink-soft hover:bg-paper disabled:opacity-60">Cancel</button>
            <button type="submit" disabled={loading} className="flex h-9 items-center gap-1.5 rounded-lg bg-ink px-3.5 text-[12.5px] font-medium text-white hover:bg-[#35312a] disabled:opacity-60">
              {loading ? <Loader2 className="size-3.5 animate-spin" /> : <KeyRound className="size-3.5" />}
              {isSetup ? "Enable & encrypt" : "Unlock"}
            </button>
          </div>
        </div>
      </form>
    </div>
  );
}

function RecoveryKeyDialog({ recoveryKey, onDone }: { recoveryKey: string; onDone: () => void }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center px-4" role="dialog" aria-modal="true">
      <div className="absolute inset-0 bg-ink/30 backdrop-blur-[2px]" />
      <div className="animate-rise relative w-full max-w-md rounded-2xl border border-line bg-surface p-5 shadow-[0_30px_80px_-30px_rgba(33,31,27,0.45)]">
        <div className="mb-3 grid size-10 place-items-center rounded-xl bg-sage/10 text-sage">
          <ShieldCheck className="size-5" />
        </div>
        <h2 className="font-serif text-[25px] leading-tight tracking-tight text-ink">Save your recovery key</h2>
        <p className="mt-2 text-[13px] leading-6 text-ink-soft">
          This key is shown <strong>once</strong>. Store it somewhere safe. If you forget your password, you’ll need it to unlock encrypted notes.
        </p>
        <div className="mt-4 rounded-xl border border-line bg-paper p-3 font-mono text-[12px] break-all text-ink">{recoveryKey}</div>
        <div className="mt-4 flex gap-2">
          <button
            type="button"
            onClick={async () => {
              try { await navigator.clipboard.writeText(recoveryKey); setCopied(true); } catch {}
            }}
            className="flex h-9 flex-1 items-center justify-center gap-2 rounded-lg border border-line bg-surface text-[12.5px] font-medium text-ink-soft hover:text-ink"
          >
            <Copy className="size-4" /> {copied ? "Copied" : "Copy key"}
          </button>
          <button type="button" onClick={onDone} className="flex h-9 flex-1 items-center justify-center rounded-lg bg-ink text-[12.5px] font-medium text-white">I saved it</button>
        </div>
      </div>
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
          <span className="grid size-14 place-items-center text-accent">
            <img src="/logo.png" alt="Lumen logo" className="size-12 rounded-xl object-contain" />
          </span>
        </div>
        <h1 className="mt-6 font-serif text-[40px] leading-[1.05] tracking-tight text-ink">
          A quiet place for
          <br />
          loud ideas.
        </h1>
        <p className="mx-auto mt-3 max-w-sm text-[13px] leading-6 text-ink-soft">
          Select a note from the sidebar, begin a blank page, or ask Lumen AI to draft something with you.
        </p>
        <div className="mt-7 flex flex-col justify-center gap-2.5 sm:flex-row">
          <button type="button" onClick={onCreate} className="flex h-10 items-center justify-center gap-2 rounded-xl bg-ink px-4 text-[12.5px] font-medium text-surface shadow-sm transition hover:bg-[#37332c]">
            <Plus className="size-4" /> New note
          </button>
          <button type="button" onClick={onOpenAi} className="flex h-10 items-center justify-center gap-2 rounded-xl border border-line bg-surface px-4 text-[12.5px] font-medium text-ink-soft shadow-sm transition hover:border-line-strong hover:text-ink">
            <Sparkles className="size-4 text-accent" /> Ask Lumen AI
          </button>
        </div>
      </div>
    </div>
  );
}
