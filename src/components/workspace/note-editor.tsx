"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  AlertCircle,
  Bold,
  Check,
  Code2,
  Eye,
  Heading2,
  Italic,
  List,
  ListChecks,
  ListOrdered,
  Loader2,
  Lock,
  Pencil,
  Quote,
  Save,
  Shield,
  Sparkles,
  Trash2,
  Undo2,
} from "lucide-react";

import { Markdown } from "@/components/markdown";
import type { Note } from "@/lib/types";
import {
  cn,
  countWords,
  formatLongDate,
  formatNoteDate,
  readingTime,
} from "@/lib/utils";

type SaveStatus = "saved" | "unsaved" | "saving" | "error";
type EditorMode = "edit" | "preview";

type NoteEditorProps = {
  note: Note;
  /** Incremented when the AI changes the open note, forcing a refresh. */
  revision: number;
  isEncrypted?: boolean;
  onSave: (
    id: string,
    update: { title: string; content: string },
  ) => Promise<Note>;
  onRequestDelete: () => void;
  onAiAction?: (prompt: string) => void;
  onRegisterFlush?: (flush: (() => Promise<boolean>) | null) => void;
  onEncryptNote?: () => void;
};

const AI_ACTIONS = [
  {
    label: "Improve",
    title: "Tighten the writing and improve clarity",
    prompt:
      "Improve the note I have open. Tighten the writing, improve clarity and flow, and keep my voice. Use the updateNote tool to save the improved version.",
  },
  {
    label: "Summarize",
    title: "Add a concise summary to the note",
    prompt:
      "Append a concise \"## Summary\" section to the note I have open. Use the appendToNote tool.",
  },
  {
    label: "Continue",
    title: "Continue writing from where the note ends",
    prompt:
      "Continue the note I have open with a natural next section that fits the existing content and voice. Use the appendToNote tool.",
  },
];

export function NoteEditor({
  note,
  revision,
  isEncrypted = false,
  onSave,
  onRequestDelete,
  onAiAction,
  onRegisterFlush,
  onEncryptNote,
}: NoteEditorProps) {
  const [title, setTitle] = useState(note.title);
  const [content, setContent] = useState(note.content);
  const [mode, setMode] = useState<EditorMode>("preview");
  const [status, setStatus] = useState<SaveStatus>("saved");
  const [canUndo, setCanUndo] = useState(false);

  const titleRef = useRef(note.title);
  const contentRef = useRef(note.content);
  const dirtyRef = useRef(false);
  const savePromiseRef = useRef<Promise<void> | null>(null);
  const noteRef = useRef(note);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const historyRef = useRef<Array<{ title: string; content: string }>>([]);
  const historyGroupRef = useRef<number>(0);
  const applyingHistoryRef = useRef(false);
  const HISTORY_LIMIT = 100;
  const HISTORY_GROUP_MS = 700;

  useEffect(() => {
    noteRef.current = note;
  }, [note]);

  const persist = useCallback((): Promise<void> => {
    if (savePromiseRef.current) return savePromiseRef.current;

    const run = (async () => {
      while (dirtyRef.current) {
        dirtyRef.current = false;
        setStatus("saving");

        try {
          await onSave(note.id, {
            title: titleRef.current,
            content: contentRef.current,
          });
        } catch {
          dirtyRef.current = true;
          setStatus("error");
          return;
        }
      }

      setStatus("saved");
    })().finally(() => {
      savePromiseRef.current = null;
    });

    savePromiseRef.current = run;
    return run;
  }, [note.id, onSave]);

  /** Flush pending changes and resolve whether the note is now saved. */
  const flush = useCallback(async (): Promise<boolean> => {
    await persist();
    if (dirtyRef.current) await persist();
    return !dirtyRef.current;
  }, [persist]);

  useEffect(() => {
    if (!onRegisterFlush) return;
    onRegisterFlush(flush);
    return () => onRegisterFlush(null);
  }, [flush, onRegisterFlush]);

  // When the AI updates this note, replace the local draft with the new content.
  useEffect(() => {
    if (revision === 0) return;
    const latest = noteRef.current;
    titleRef.current = latest.title;
    contentRef.current = latest.content;
    setTitle(latest.title);
    setContent(latest.content);
    dirtyRef.current = false;
    setStatus("saved");
    historyRef.current = [];
    historyGroupRef.current = 0;
    setCanUndo(false);
  }, [revision]);

  // Debounced auto-save.
  useEffect(() => {
    if (!dirtyRef.current) return;
    const timer = window.setTimeout(() => {
      void persist();
    }, 900);

    return () => window.clearTimeout(timer);
  }, [title, content, persist]);

  // Auto-grow the Markdown textarea to fit its content.
  useEffect(() => {
    const textarea = textareaRef.current;
    if (!textarea) return;
    textarea.style.height = "auto";
    textarea.style.height = `${textarea.scrollHeight}px`;
  }, [content, mode, title]);

  // Best-effort flush if the editor unmounts before the debounce fires.
  // For encrypted notes, plaintext keepalive would corrupt stored data, so skip and rely on normal save.
  useEffect(() => {
    const noteId = note.id;
    const encrypted = (note.encryptionVersion ?? 0) > 0;
    return () => {
      if (!dirtyRef.current || encrypted) return;
      void fetch(`/api/notes/${noteId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: titleRef.current,
          content: contentRef.current,
          encryptionVersion: 0,
        }),
        keepalive: true,
      }).catch(() => undefined);
    };
  }, [note.id, note.encryptionVersion]);

  function markDirty() {
    dirtyRef.current = true;
    setStatus("unsaved");
  }

  function pushHistorySnapshot(force = false) {
    if (applyingHistoryRef.current) return;
    const snapshot = { title: titleRef.current, content: contentRef.current };
    const last = historyRef.current[historyRef.current.length - 1];
    if (!last) {
      historyRef.current.push(snapshot);
      historyGroupRef.current = Date.now();
      setCanUndo(false);
      return;
    }
    if (last.title === snapshot.title && last.content === snapshot.content) {
      return;
    }
    const now = Date.now();
    if (!force && now - historyGroupRef.current < HISTORY_GROUP_MS) {
      // Coalesce rapid edits into the current undo step.
      historyGroupRef.current = now;
      setCanUndo(historyRef.current.length > 0);
      return;
    }
    historyRef.current.push(snapshot);
    if (historyRef.current.length > HISTORY_LIMIT) {
      historyRef.current.shift();
    }
    historyGroupRef.current = now;
    setCanUndo(historyRef.current.length > 0);
  }

  function ensureHistorySeed() {
    if (historyRef.current.length === 0) {
      historyRef.current.push({ title: titleRef.current, content: contentRef.current });
      historyGroupRef.current = 0;
      setCanUndo(false);
    }
  }

  const undo = useCallback(() => {
    const stack = historyRef.current;
    if (stack.length === 0) return;
    const previous = stack.pop();
    if (!previous) return;
    applyingHistoryRef.current = true;
    titleRef.current = previous.title;
    contentRef.current = previous.content;
    setTitle(previous.title);
    setContent(previous.content);
    dirtyRef.current = true;
    setStatus("unsaved");
    setCanUndo(stack.length > 0);
    requestAnimationFrame(() => {
      applyingHistoryRef.current = false;
    });
  }, []);

  // Keyboard shortcuts: Cmd/Ctrl + S, Cmd/Ctrl + Z (undo).
  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (!(event.metaKey || event.ctrlKey)) return;
      const key = event.key.toLowerCase();
      if (key === "s") {
        event.preventDefault();
        void persist();
      } else if (key === "z" && !event.shiftKey) {
        event.preventDefault();
        undo();
      }
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [persist, undo]);

  function handleTitleChange(value: string) {
    ensureHistorySeed();
    pushHistorySnapshot();
    titleRef.current = value;
    setTitle(value);
    markDirty();
  }

  function handleContentChange(value: string) {
    ensureHistorySeed();
    pushHistorySnapshot();
    contentRef.current = value;
    setContent(value);
    markDirty();
  }

  function applyWrap(before: string, after: string, placeholder: string) {
    const textarea = textareaRef.current;
    if (!textarea) return;

    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const selected = content.slice(start, end) || placeholder;
    const next =
      content.slice(0, start) + before + selected + after + content.slice(end);

    handleContentChange(next);
    requestAnimationFrame(() => {
      textarea.focus();
      textarea.setSelectionRange(
        start + before.length,
        start + before.length + selected.length,
      );
    });
  }

  function applyLinePrefix(prefix: string) {
    const textarea = textareaRef.current;
    if (!textarea) return;

    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const selected = content.slice(start, end);
    const lineStart = content.lastIndexOf("\n", start - 1) + 1;
    const lineEndIndex = content.indexOf("\n", end);
    const blockEnd = lineEndIndex === -1 ? content.length : lineEndIndex;
    const block = content.slice(lineStart, blockEnd);
    const lines = block.split("\n");

    const markerInfo = (line: string) => {
      const m = line.match(/^(\s*)((?:- \[[ xX]\] )|(?:[-*+] )|(?:\d+\. )|(?:> )|(?:#{1,6} ))?(.*)$/);
      return {
        indent: m?.[1] ?? "",
        marker: m?.[2] ?? "",
        rest: m?.[3] ?? line,
      };
    };
    const isSameMarkerType = (existing: string, target: string) => {
      if (!existing) return false;
      if (target === "- [ ] ") return /^- \[[ xX]\] $/.test(existing);
      if (target === "- ") return /^[-*+] $/.test(existing) && !/^- \[[ xX]\] $/.test(existing);
      if (target === "1. ") return /^\d+\. $/.test(existing);
      if (target === "> ") return /^> $/.test(existing);
      if (target === "## ") return /^#{1,6} $/.test(existing);
      return existing === target;
    };

    const nonEmpty = lines.filter((line) => line.trim().length > 0);
    const shouldRemove =
      nonEmpty.length > 0 &&
      nonEmpty.every((line) => isSameMarkerType(markerInfo(line).marker, prefix));

    let orderedIndex = 1;
    const nextBlock = lines
      .map((line) => {
        if (line.trim().length === 0) return line;
        const info = markerInfo(line);
        if (shouldRemove) {
          return isSameMarkerType(info.marker, prefix)
            ? `${info.indent}${info.rest}`
            : line;
        }
        const target = prefix === "1. " ? `${orderedIndex++}. ` : prefix;
        return `${info.indent}${target}${info.rest}`;
      })
      .join("\n");

    const next = content.slice(0, lineStart) + nextBlock + content.slice(blockEnd);
    handleContentChange(next);
    requestAnimationFrame(() => {
      textarea.focus();
      if (selected.length === 0) {
        const beforeLine = content.slice(
          lineStart,
          content.indexOf("\n", lineStart) === -1 ? content.length : content.indexOf("\n", lineStart),
        );
        const afterLine = next.slice(
          lineStart,
          next.indexOf("\n", lineStart) === -1 ? next.length : next.indexOf("\n", lineStart),
        );
        const beforeInfo = markerInfo(beforeLine);
        const afterInfo = markerInfo(afterLine);
        const delta =
          afterInfo.indent.length +
          afterInfo.marker.length -
          (beforeInfo.indent.length + beforeInfo.marker.length);
        const position = Math.max(
          lineStart,
          Math.min(start + delta, lineStart + afterLine.length),
        );
        textarea.setSelectionRange(position, position);
      } else {
        textarea.setSelectionRange(lineStart, lineStart + nextBlock.length);
      }
    });
  }

  function handleEditorKeyDown(event: React.KeyboardEvent<HTMLTextAreaElement>) {
    const textarea = textareaRef.current;
    if (!textarea) return;

    // Bold / Italic shortcuts
    if ((event.metaKey || event.ctrlKey) && !event.shiftKey) {
      const key = event.key.toLowerCase();
      if (key === "b") {
        event.preventDefault();
        applyWrap("**", "**", "bold text");
        return;
      }
      if (key === "i") {
        event.preventDefault();
        applyWrap("_", "_", "italic text");
        return;
      }
    }

    // Indent / outdent selected lines
    if (event.key === "Tab") {
      event.preventDefault();
      const start = textarea.selectionStart;
      const end = textarea.selectionEnd;
      const lineStart = content.lastIndexOf("\n", start - 1) + 1;
      const lineEndIndex = content.indexOf("\n", end);
      const blockEnd = lineEndIndex === -1 ? content.length : lineEndIndex;
      const block = content.slice(lineStart, blockEnd);
      const lines = block.split("\n");
      const nextBlock = lines
        .map((line) => {
          if (event.shiftKey) {
            return line.replace(/^( {1,2}|\t)/, "");
          }
          return line.length === 0 ? line : `  ${line}`;
        })
        .join("\n");
      const next = content.slice(0, lineStart) + nextBlock + content.slice(blockEnd);
      handleContentChange(next);
      requestAnimationFrame(() => {
        textarea.focus();
        if (start === end) {
          const delta = event.shiftKey ? -Math.min(2, (lines[0]?.match(/^( {1,2}|\t)/)?.[0].length ?? 0)) : 2;
          const pos = Math.max(lineStart, start + delta);
          textarea.setSelectionRange(pos, pos);
        } else {
          textarea.setSelectionRange(lineStart, lineStart + nextBlock.length);
        }
      });
      return;
    }

    // Continue lists / blockquotes on Enter
    if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
      const start = textarea.selectionStart;
      const end = textarea.selectionEnd;
      if (start !== end) return; // let default behavior for replacements
      const lineStart = content.lastIndexOf("\n", start - 1) + 1;
      const line = content.slice(lineStart, start);
      const m = line.match(/^(\s*)((?:- \[[ xX]\] )|(?:[-*+] )|(?:\d+\. )|(?:> ))(.*)$/);
      if (!m) return;
      const [, indent, marker, rest] = m;
      if (rest.trim().length === 0) {
        // Empty list/quote item: exit the block
        event.preventDefault();
        const next = content.slice(0, lineStart) + content.slice(start);
        handleContentChange(next);
        requestAnimationFrame(() => {
          textarea.focus();
          textarea.setSelectionRange(lineStart, lineStart);
        });
        return;
      }
      event.preventDefault();
      let nextMarker = marker;
      const numMatch = marker.match(/^(\d+)\. $/);
      if (numMatch) nextMarker = `${Number(numMatch[1]) + 1}. `;
      if (/^- \[[xX]\] $/.test(marker)) nextMarker = "- [ ] ";
      const insert = `\n${indent}${nextMarker}`;
      const next = content.slice(0, start) + insert + content.slice(end);
      handleContentChange(next);
      requestAnimationFrame(() => {
        textarea.focus();
        const pos = start + insert.length;
        textarea.setSelectionRange(pos, pos);
      });
    }
  }

  const words = countWords(content);
  const minutes = readingTime(content);

  const statusLabel: Record<SaveStatus, string> = {
    saved: "Saved",
    unsaved: "Unsaved changes",
    saving: "Saving…",
    error: "Save failed",
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {/* Editor toolbar */}
      <div className="flex h-[52px] shrink-0 items-center justify-between gap-3 border-b border-line/80 px-4 md:px-7">
        <div
          className={cn(
            "flex items-center gap-1.5 text-[11.5px] font-medium",
            status === "saved" && "text-sage",
            status === "unsaved" && "text-amber-600",
            status === "saving" && "text-accent",
            status === "error" && "text-red-600",
          )}
          aria-live="polite"
        >
          {status === "saving" && (
            <Loader2 className="size-3.5 animate-spin" />
          )}
          {status === "saved" && <Check className="size-3.5" />}
          {status === "unsaved" && (
            <span className="size-1.5 rounded-full bg-amber-500" />
          )}
          {status === "error" && <AlertCircle className="size-3.5" />}
          {statusLabel[status]}
          <span className="hidden text-muted sm:inline">
            · edited{" "}
            <span suppressHydrationWarning>
              {formatNoteDate(note.updatedAt)}
            </span>
          </span>
        </div>

        <div className="flex items-center gap-1">
          {isEncrypted ? (
            <span className="mr-1 hidden items-center gap-1 rounded-md bg-sage/10 px-2 py-1 text-[10.5px] font-medium text-sage sm:inline-flex" title="This note's content is encrypted">
              <Lock className="size-3" /> Encrypted
            </span>
          ) : onEncryptNote ? (
            <button
              type="button"
              onClick={onEncryptNote}
              className="mr-1 flex h-8 items-center gap-1.5 rounded-lg px-2.5 text-[12px] font-medium text-ink-soft transition hover:bg-paper hover:text-ink"
              title="Encrypt this note (one-way)"
              aria-label="Encrypt note"
            >
              <Shield className="size-3.5" />
              <span className="hidden sm:inline">Encrypt</span>
            </button>
          ) : null}

          <button
            type="button"
            onClick={() =>
              setMode((current) => (current === "edit" ? "preview" : "edit"))
            }
            className="flex h-8 items-center gap-1.5 rounded-lg px-2.5 text-[12px] font-medium text-ink-soft transition hover:bg-paper hover:text-ink"
            title={mode === "edit" ? "Preview Markdown" : "Edit Markdown"}
            aria-label={mode === "edit" ? "Preview Markdown" : "Edit Markdown"}
          >
            {mode === "edit" ? (
              <>
                <Eye className="size-3.5" />
                <span className="hidden sm:inline">Preview</span>
              </>
            ) : (
              <>
                <Pencil className="size-3.5" />
                <span className="hidden sm:inline">Edit</span>
              </>
            )}
          </button>

          <button
            type="button"
            onClick={() => void persist()}
            disabled={status === "saving"}
            className="flex h-8 items-center gap-1.5 rounded-lg px-2.5 text-[12px] font-medium text-ink-soft transition hover:bg-paper hover:text-ink disabled:cursor-default disabled:opacity-45"
            title="Save note (Ctrl/Cmd + S)"
            aria-label="Save note"
          >
            {status === "saving" ? (
              <Loader2 className="size-3.5 animate-spin" />
            ) : (
              <Save className="size-3.5" />
            )}
            <span className="hidden sm:inline">Save</span>
          </button>

          <span className="mx-1 h-5 w-px bg-line" />

          <button
            type="button"
            onClick={undo}
            disabled={!canUndo}
            className="grid size-8 place-items-center rounded-lg text-muted transition hover:bg-paper hover:text-ink disabled:cursor-default disabled:opacity-35"
            title="Undo (Ctrl/Cmd + Z)"
            aria-label="Undo"
          >
            <Undo2 className="size-3.5" />
          </button>

          <button
            type="button"
            onClick={onRequestDelete}
            className="grid size-8 place-items-center rounded-lg text-muted transition hover:bg-red-50 hover:text-red-600"
            title="Delete note"
            aria-label="Delete note"
          >
            <Trash2 className="size-3.5" />
          </button>
        </div>
      </div>

      {/* Scrollable document */}
      <div className="flex-1 overflow-y-auto">
        <div className="mx-auto w-full max-w-3xl px-5 pb-28 pt-9 sm:px-8 md:px-10 md:pt-12">
          <input
            value={title}
            onChange={(event) => handleTitleChange(event.target.value)}
            onBlur={() => void persist()}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                textareaRef.current?.focus();
              }
            }}
            placeholder="Untitled note"
            aria-label="Note title"
            spellCheck={false}
            className="w-full bg-transparent font-serif text-[38px] leading-[1.06] tracking-tight text-ink outline-none placeholder:text-muted/45 sm:text-[46px]"
          />

          <div className="mt-4 flex flex-wrap items-center gap-x-2.5 gap-y-1 text-[11px] text-muted">
            <span suppressHydrationWarning>
              {formatLongDate(note.createdAt)}
            </span>
            <span className="size-1 rounded-full bg-line-strong" />
            <span>
              {words} {words === 1 ? "word" : "words"}
            </span>
            <span className="size-1 rounded-full bg-line-strong" />
            <span>{minutes} min read</span>
          </div>

          <div className="my-7 h-px bg-line/80" />

          {onAiAction && (
            <div className="mb-5 flex flex-wrap items-center gap-1.5">
              <span className="mr-0.5 inline-flex items-center gap-1.5 text-[10px] font-medium uppercase tracking-[0.16em] text-muted">
                <Sparkles className="size-3 text-accent" />
                AI actions
              </span>
              {AI_ACTIONS.map((action) => (
                <button
                  key={action.label}
                  type="button"
                  onClick={() => onAiAction(action.prompt)}
                  title={action.title}
                  className="rounded-full border border-line bg-paper/60 px-2.5 py-1 text-[10.5px] font-medium text-ink-soft transition hover:border-accent/30 hover:bg-accent-soft hover:text-accent-deep"
                >
                  {action.label}
                </button>
              ))}
            </div>
          )}

          {mode === "edit" ? (
            <>
              {/* Markdown formatting toolbar */}
              <div
                className="no-scrollbar mb-4 flex items-center gap-0.5 overflow-x-auto"
                role="toolbar"
                aria-label="Markdown formatting"
              >
                <ToolbarButton
                  label="Bold"
                  onClick={() => applyWrap("**", "**", "bold text")}
                >
                  <Bold className="size-3.5" />
                </ToolbarButton>
                <ToolbarButton
                  label="Italic"
                  onClick={() => applyWrap("_", "_", "italic text")}
                >
                  <Italic className="size-3.5" />
                </ToolbarButton>
                <ToolbarButton
                  label="Heading"
                  onClick={() => applyLinePrefix("## ")}
                >
                  <Heading2 className="size-3.5" />
                </ToolbarButton>
                <span className="mx-1 h-4 w-px shrink-0 bg-line" />
                <ToolbarButton
                  label="Bullet list"
                  onClick={() => applyLinePrefix("- ")}
                >
                  <List className="size-3.5" />
                </ToolbarButton>
                <ToolbarButton
                  label="Numbered list"
                  onClick={() => applyLinePrefix("1. ")}
                >
                  <ListOrdered className="size-3.5" />
                </ToolbarButton>
                <ToolbarButton
                  label="Task list"
                  onClick={() => applyLinePrefix("- [ ] ")}
                >
                  <ListChecks className="size-3.5" />
                </ToolbarButton>
                <ToolbarButton
                  label="Quote"
                  onClick={() => applyLinePrefix("> ")}
                >
                  <Quote className="size-3.5" />
                </ToolbarButton>
                <ToolbarButton
                  label="Inline code"
                  onClick={() => applyWrap("`", "`", "code")}
                >
                  <Code2 className="size-3.5" />
                </ToolbarButton>
                <span className="ml-auto hidden shrink-0 pl-3 text-[10.5px] text-muted sm:inline">
                  Markdown supported
                </span>
              </div>

              <textarea
                ref={textareaRef}
                value={content}
                onChange={(event) => handleContentChange(event.target.value)}
                onKeyDown={handleEditorKeyDown}
                onBlur={() => void persist()}
                placeholder={`Start writing, or ask Lumen AI to draft something…

## A heading
- A thought worth keeping
- [ ] A next step`}
                aria-label="Note content"
                spellCheck
                className="no-resize min-h-[42vh] w-full overflow-hidden bg-transparent font-mono text-[13.5px] leading-7 text-ink-soft outline-none placeholder:text-muted/50"
              />
            </>
          ) : (
            <div className="min-h-[42vh]">
              {content.trim() ? (
                <Markdown
                  className="prose-base text-[15px]"
                  onToggleTask={(taskIndex, checked) => {
                    let i = -1;
                    const next = content.replace(
                      /^(\s*[-*+]\s+)\[( |x|X)\](?=\s|$)/gm,
                      (match, lead) => {
                        i += 1;
                        if (i !== taskIndex) return match;
                        return `${lead}[${checked ? "x" : " "}]`;
                      },
                    );
                    if (next !== content) handleContentChange(next);
                  }}
                >
                  {content}
                </Markdown>
              ) : (
                <div className="rounded-xl border border-dashed border-line-strong/70 bg-paper/40 px-6 py-10 text-center">
                  <p className="text-[13px] text-muted">
                    This note is still blank. Switch back to editing to add
                    something.
                  </p>
                  <button
                    type="button"
                    onClick={() => setMode("edit")}
                    className="mt-3 text-[12px] font-medium text-accent-deep hover:underline"
                  >
                    Start writing
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function ToolbarButton({
  label,
  onClick,
  children,
}: {
  label: string;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={label}
      aria-label={label}
      className="grid size-7 shrink-0 place-items-center rounded-md text-muted transition hover:bg-paper hover:text-ink"
    >
      {children}
    </button>
  );
}
