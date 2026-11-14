"use client";

import { useEffect, useRef, useState } from "react";
import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport } from "ai";
import {
  AlertCircle,
  ArrowUp,
  ArrowUpRight,
  Check,
  FileText,
  Loader2,
  RotateCcw,
  Search,
  Sparkles,
  Square,
  X,
} from "lucide-react";

import { Markdown } from "@/components/markdown";
import type { NoteUIMessage } from "@/lib/types";
import { cn } from "@/lib/utils";

const transport = new DefaultChatTransport({ api: "/api/chat" });

const suggestions = [
  {
    title: "Build a study plan",
    prompt:
      "Create a structured 2-week study plan for mastering TypeScript fundamentals. Save it as a note.",
  },
  {
    title: "Plan a side project",
    prompt:
      "Help me plan a 7-day launch for a small side project. Turn it into an actionable note with daily tasks.",
  },
  {
    title: "Turn an idea into a note",
    prompt:
      "Turn this idea into a well-organized note: a weekly review ritual that takes 20 minutes every Friday.",
  },
];

type AiChatPanelProps = {
  className?: string;
  noteId: string | null;
  onBeforeSend: () => Promise<boolean>;
  onClose: () => void;
  onNoteCreated: (noteId: string) => void | Promise<void>;
  onNoteUpdated: (noteId: string) => void | Promise<void>;
  onOpenNote: (noteId: string) => void;
  registerSend?: (send: ((text: string) => void) | null) => void;
};

export function AiChatPanel({
  className,
  noteId,
  onBeforeSend,
  onClose,
  onNoteCreated,
  onNoteUpdated,
  onOpenNote,
  registerSend,
}: AiChatPanelProps) {
  const [input, setInput] = useState("");
  const [sendError, setSendError] = useState<string | null>(null);
  const [preparing, setPreparing] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const createdRef = useRef(onNoteCreated);
  const updatedRef = useRef(onNoteUpdated);
  const submittingRef = useRef(false);

  useEffect(() => {
    createdRef.current = onNoteCreated;
    updatedRef.current = onNoteUpdated;
  }, [onNoteCreated, onNoteUpdated]);

  const { messages, sendMessage, status, error, stop, regenerate } =
    useChat<NoteUIMessage>({
      transport,
      onFinish: ({ message }) => {
        void (async () => {
          const created = new Set<string>();
          const updated = new Set<string>();

          for (const part of message.parts) {
            if (
              part.type === "tool-createNote" &&
              part.state === "output-available"
            ) {
              created.add(part.output.id);
            } else if (
              (part.type === "tool-updateNote" ||
                part.type === "tool-appendToNote") &&
              part.state === "output-available"
            ) {
              updated.add(part.output.id);
            }
          }

          for (const id of created) await createdRef.current(id);
          for (const id of updated) await updatedRef.current(id);
        })();
      },
    });

  const busy = status === "submitted" || status === "streaming";
  const working = busy || preparing;

  useEffect(() => {
    const element = scrollRef.current;
    if (!element) return;
    element.scrollTop = element.scrollHeight;
  }, [messages, status]);

  useEffect(() => {
    const element = inputRef.current;
    if (!element) return;
    element.style.height = "auto";
    element.style.height = `${Math.min(element.scrollHeight, 132)}px`;
  }, [input]);

  async function submit(text?: string) {
    const value = (text ?? input).trim();
    if (!value || busy || preparing || submittingRef.current) return;

    submittingRef.current = true;
    setSendError(null);
    setPreparing(true);
    let ready = false;
    try {
      ready = await onBeforeSend();
    } catch {
      ready = false;
    }
    setPreparing(false);
    submittingRef.current = false;

    if (!ready) {
      setSendError(
        "Couldn’t save the current note. Try again before asking the AI to edit it.",
      );
      return;
    }

    setInput("");
    void sendMessage({ text: value }, { body: { noteId } });
  }

  async function retry() {
    setSendError(null);
    let ready = false;
    try {
      ready = await onBeforeSend();
    } catch {
      ready = false;
    }

    if (!ready) {
      setSendError(
        "Couldn’t save the current note. Try again before asking the AI to edit it.",
      );
      return;
    }

    void regenerate({ body: { noteId } });
  }

  const submitRef = useRef<(text?: string) => void>(() => {});

  useEffect(() => {
    submitRef.current = (text) => {
      void submit(text);
    };
  });

  useEffect(() => {
    if (!registerSend) return;
    registerSend((text) => submitRef.current(text));
    return () => registerSend(null);
  }, [registerSend]);

  return (
    <aside
      className={cn(
        "h-full w-full shrink-0 flex-col border-l border-line bg-[#faf8f3] md:w-[400px]",
        className,
      )}
      aria-label="AI assistant"
    >
      {/* Header */}
      <div className="flex h-[58px] shrink-0 items-center justify-between border-b border-line/80 px-4">
        <div className="flex items-center gap-2.5">
          <span className="relative grid size-8 place-items-center rounded-lg bg-gradient-to-br from-accent to-[#8b7cf6] text-white shadow-sm">
            <Sparkles className="size-4" />
            <span className="absolute -right-0.5 -top-0.5 size-2 rounded-full bg-[#b9b4ff] ring-2 ring-[#faf8f3]" />
          </span>
          <div>
            <p className="text-[13px] font-semibold leading-none text-ink">
              Lumen AI
            </p>
            <p className="mt-1 flex items-center gap-1.5 text-[10.5px] leading-none text-muted">
              <span
                className={cn(
                  "size-1.5 rounded-full",
                  working
                    ? "animate-pulse bg-accent"
                    : status === "error"
                      ? "bg-red-500"
                      : "bg-sage",
                )}
              />
              {preparing
                ? "Saving note…"
                : status === "submitted"
                  ? "Thinking…"
                  : status === "streaming"
                    ? "Writing…"
                    : status === "error"
                      ? "Something went wrong"
                      : "Ready to help"}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={onClose}
            className="grid size-8 place-items-center rounded-lg text-muted transition hover:bg-white hover:text-ink"
            aria-label="Close AI panel"
            title="Close AI panel"
          >
            <X className="size-4" />
          </button>
        </div>
      </div>

      {/* Messages */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto">
        <div className="space-y-5 px-4 py-5">
          {messages.length === 0 && (
            <div className="animate-rise">
              <div className="mt-2 text-center">
                <span className="mx-auto grid size-11 place-items-center rounded-2xl bg-accent-soft text-accent">
                  <Sparkles className="size-5" />
                </span>
                <h2 className="mt-3 font-serif text-[26px] leading-tight tracking-tight text-ink">
                  What should we make?
                </h2>
                <p className="mx-auto mt-2 max-w-[260px] text-[12px] leading-5 text-muted">
                  Ask a question, or tell me to turn an idea into a note. I can
                  save it straight to your notebook.
                </p>
              </div>

              <div className="mt-6 space-y-2">
                {suggestions.map((suggestion) => (
                  <button
                    key={suggestion.title}
                    type="button"
                    onClick={() => submit(suggestion.prompt)}
                    className="group flex w-full items-center gap-3 rounded-xl border border-line bg-surface/70 px-3.5 py-3 text-left transition hover:border-line-strong hover:bg-surface hover:shadow-sm"
                  >
                    <span className="grid size-7 shrink-0 place-items-center rounded-lg bg-accent-soft text-accent">
                      <Sparkles className="size-3.5" />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block text-[12px] font-medium text-ink">
                        {suggestion.title}
                      </span>
                      <span className="mt-0.5 block truncate text-[10.5px] text-muted">
                        {suggestion.prompt}
                      </span>
                    </span>
                    <ArrowUpRight className="size-3.5 shrink-0 text-muted transition group-hover:text-ink" />
                  </button>
                ))}
              </div>

              <p className="mt-5 flex items-center justify-center gap-1.5 text-[10px] text-muted/80">
                <span className="size-1 rounded-full bg-line-strong" />
                AI can make mistakes. Check important details.
              </p>
            </div>
          )}

          {messages.map((message) => {
            const isUser = message.role === "user";

            return (
              <div
                key={message.id}
                className={cn(
                  "animate-fade flex gap-2.5",
                  isUser && "justify-end",
                )}
              >
                {!isUser && (
                  <span className="mt-0.5 grid size-6 shrink-0 place-items-center rounded-md bg-gradient-to-br from-accent to-[#8b7cf6] text-white">
                    <Sparkles className="size-3" />
                  </span>
                )}

                <div
                  className={cn(
                    "min-w-0 space-y-2",
                    isUser ? "max-w-[85%]" : "max-w-[calc(100%-2rem)]",
                  )}
                >
                  {message.parts.map((part, index) => {
                    if (part.type === "text") {
                      if (!part.text.trim()) return null;

                      return isUser ? (
                        <div
                          key={`${message.id}-text-${index}`}
                          className="whitespace-pre-wrap rounded-2xl rounded-br-md bg-ink px-3.5 py-2.5 text-[12.5px] leading-6 text-surface shadow-sm"
                        >
                          {part.text}
                        </div>
                      ) : (
                        <Markdown
                          key={`${message.id}-text-${index}`}
                          className="prose-sm text-[12.5px] leading-6 prose-p:my-2 prose-headings:mb-2 prose-headings:mt-4 prose-ul:my-2 prose-ol:my-2 prose-li:my-0.5 prose-pre:my-3 prose-pre:text-[11.5px]"
                        >
                          {part.text}
                        </Markdown>
                      );
                    }

                    if (part.type === "tool-createNote") {
                      return (
                        <NoteToolCard
                          key={`${message.id}-tool-${index}`}
                          part={part}
                          onOpenNote={onOpenNote}
                        />
                      );
                    }

                    if (
                      part.type === "tool-updateNote" ||
                      part.type === "tool-appendToNote"
                    ) {
                      return (
                        <NoteEditToolCard
                          key={`${message.id}-tool-${index}`}
                          part={part}
                          kind={
                            part.type === "tool-updateNote" ? "update" : "append"
                          }
                          onOpenNote={onOpenNote}
                        />
                      );
                    }

                    if (part.type === "tool-searchNotes") {
                      return (
                        <NoteSearchToolCard
                          key={`${message.id}-tool-${index}`}
                          part={part}
                          onOpenNote={onOpenNote}
                        />
                      );
                    }

                    return null;
                  })}
                </div>
              </div>
            );
          })}

          {status === "submitted" && (
            <div className="flex items-center gap-2.5">
              <span className="grid size-6 shrink-0 place-items-center rounded-md bg-gradient-to-br from-accent to-[#8b7cf6] text-white">
                <Sparkles className="size-3" />
              </span>
              <span className="flex items-center gap-1 rounded-full bg-white px-3 py-2 ring-1 ring-line">
                <span className="size-1.5 animate-bounce rounded-full bg-muted [animation-delay:-0.2s]" />
                <span className="size-1.5 animate-bounce rounded-full bg-muted [animation-delay:-0.1s]" />
                <span className="size-1.5 animate-bounce rounded-full bg-muted" />
              </span>
            </div>
          )}
        </div>
      </div>

      {/* Composer */}
      <div className="shrink-0 border-t border-line/80 bg-[#faf8f3]/90 p-3 backdrop-blur">
        {sendError && (
          <div className="mb-2 flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-[11px] leading-5 text-amber-800">
            <AlertCircle className="mt-0.5 size-3.5 shrink-0" />
            <span>{sendError}</span>
          </div>
        )}

        {error && (
          <div className="mb-2 flex items-center justify-between gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-[11px] text-red-700">
            <span className="flex items-center gap-1.5">
              <AlertCircle className="size-3.5 shrink-0" />
              The assistant hit a snag.
            </span>
            <button
              type="button"
              onClick={() => {
                void retry();
              }}
              className="flex shrink-0 items-center gap-1 rounded-md px-1.5 py-1 font-medium transition hover:bg-red-100"
            >
              <RotateCcw className="size-3" />
              Retry
            </button>
          </div>
        )}

        <div className="rounded-2xl border border-line bg-surface p-2 shadow-[0_1px_2px_rgba(33,31,27,0.04)] transition focus-within:border-accent/35 focus-within:ring-4 focus-within:ring-accent/10">
          <textarea
            ref={inputRef}
            value={input}
            onChange={(event) => setInput(event.target.value)}
            onKeyDown={(event) => {
              if (
                event.key === "Enter" &&
                !event.shiftKey &&
                !event.nativeEvent.isComposing
              ) {
                event.preventDefault();
                submit();
              }
            }}
            rows={1}
            placeholder="Ask anything, or say “create a note…”"
            aria-label="Message the AI assistant"
            disabled={working}
            className="no-resize max-h-[132px] min-h-[42px] w-full overflow-y-auto bg-transparent px-2 py-2 text-[12.5px] leading-5 text-ink outline-none placeholder:text-muted/75 disabled:opacity-60"
          />
          <div className="flex items-center justify-between gap-2 px-1 pb-0.5 pt-1">
            <p className="text-[9.5px] text-muted/90">
              Enter to send · Shift+Enter for a new line
            </p>
            {busy ? (
              <button
                type="button"
                onClick={stop}
                className="grid size-7 place-items-center rounded-full bg-ink text-surface transition hover:bg-[#37332c]"
                aria-label="Stop generating"
                title="Stop generating"
              >
                <Square className="size-3 fill-current" />
              </button>
            ) : (
              <button
                type="button"
                onClick={() => submit()}
                disabled={!input.trim() || working}
                className="grid size-7 place-items-center rounded-full bg-ink text-surface transition hover:bg-[#37332c] disabled:cursor-not-allowed disabled:bg-line-strong disabled:text-surface"
                aria-label="Send message"
                title="Send message"
              >
                {preparing ? (
                  <Loader2 className="size-3.5 animate-spin" />
                ) : (
                  <ArrowUp className="size-3.5" />
                )}
              </button>
            )}
          </div>
        </div>
      </div>
    </aside>
  );
}

function NoteToolCard({
  part,
  onOpenNote,
}: {
  part: Extract<NoteUIMessage["parts"][number], { type: "tool-createNote" }>;
  onOpenNote: (noteId: string) => void;
}) {
  if (part.state === "input-streaming" || part.state === "input-available") {
    const title =
      typeof part.input === "object" && part.input
        ? part.input.title
        : undefined;

    return (
      <div className="flex items-center gap-2.5 rounded-xl border border-line bg-surface px-3 py-2.5">
        <span className="grid size-7 shrink-0 place-items-center rounded-lg bg-accent-soft text-accent">
          <Loader2 className="size-3.5 animate-spin" />
        </span>
        <div className="min-w-0">
          <p className="text-[11px] font-medium text-ink">
            {part.state === "input-streaming"
              ? "Drafting a note…"
              : "Saving to your notes…"}
          </p>
          {title && (
            <p className="mt-0.5 truncate text-[10.5px] text-muted">{title}</p>
          )}
        </div>
      </div>
    );
  }

  if (part.state === "output-available") {
    return (
      <div className="animate-rise overflow-hidden rounded-xl border border-line bg-surface shadow-sm">
        <div className="flex items-start gap-2.5 px-3 py-3">
          <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-sage/10 text-sage">
            <FileText className="size-4" />
          </span>
          <div className="min-w-0 flex-1">
            <p className="flex items-center gap-1.5 text-[10px] font-medium uppercase tracking-[0.14em] text-sage">
              <Check className="size-3" />
              Note saved
            </p>
            <p className="mt-1 truncate text-[12px] font-medium text-ink">
              {part.output.title}
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={() => onOpenNote(part.output.id)}
          className="flex w-full items-center justify-between border-t border-line/80 bg-paper/40 px-3 py-2 text-[10.5px] font-medium text-ink-soft transition hover:bg-paper hover:text-ink"
        >
          Open in editor
          <ArrowUpRight className="size-3" />
        </button>
      </div>
    );
  }

  if (part.state === "output-error") {
    return (
      <div className="flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 px-3 py-2.5 text-[11px] leading-5 text-red-700">
        <AlertCircle className="mt-0.5 size-3.5 shrink-0" />
        <span>Couldn’t save that note. {part.errorText}</span>
      </div>
    );
  }

  return null;
}

type NoteEditToolPart = Extract<
  NoteUIMessage["parts"][number],
  { type: "tool-updateNote" | "tool-appendToNote" }
>;

function NoteEditToolCard({
  part,
  kind,
  onOpenNote,
}: {
  part: NoteEditToolPart;
  kind: "update" | "append";
  onOpenNote: (noteId: string) => void;
}) {
  if (part.state === "input-streaming" || part.state === "input-available") {
    return (
      <div className="flex items-center gap-2.5 rounded-xl border border-line bg-surface px-3 py-2.5">
        <span className="grid size-7 shrink-0 place-items-center rounded-lg bg-accent-soft text-accent">
          <Loader2 className="size-3.5 animate-spin" />
        </span>
        <div className="min-w-0">
          <p className="text-[11px] font-medium text-ink">
            {kind === "update" ? "Updating your note…" : "Adding to your note…"}
          </p>
          <p className="mt-0.5 truncate text-[10.5px] text-muted">
            Applying the AI’s changes as Markdown.
          </p>
        </div>
      </div>
    );
  }

  if (part.state === "output-available") {
    return (
      <div className="animate-rise overflow-hidden rounded-xl border border-line bg-surface shadow-sm">
        <div className="flex items-start gap-2.5 px-3 py-3">
          <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-sage/10 text-sage">
            <FileText className="size-4" />
          </span>
          <div className="min-w-0 flex-1">
            <p className="flex items-center gap-1.5 text-[10px] font-medium uppercase tracking-[0.14em] text-sage">
              <Check className="size-3" />
              {kind === "update" ? "Note updated" : "Note extended"}
            </p>
            <p className="mt-1 truncate text-[12px] font-medium text-ink">
              {part.output.title}
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={() => onOpenNote(part.output.id)}
          className="flex w-full items-center justify-between border-t border-line/80 bg-paper/40 px-3 py-2 text-[10.5px] font-medium text-ink-soft transition hover:bg-paper hover:text-ink"
        >
          Open in editor
          <ArrowUpRight className="size-3" />
        </button>
      </div>
    );
  }

  if (part.state === "output-error") {
    return (
      <div className="flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 px-3 py-2.5 text-[11px] leading-5 text-red-700">
        <AlertCircle className="mt-0.5 size-3.5 shrink-0" />
        <span>
          Couldn’t {kind === "update" ? "update" : "extend"} that note.{" "}
          {part.errorText}
        </span>
      </div>
    );
  }

  return null;
}

type NoteSearchToolPart = Extract<
  NoteUIMessage["parts"][number],
  { type: "tool-searchNotes" }
>;

function NoteSearchToolCard({
  part,
  onOpenNote,
}: {
  part: NoteSearchToolPart;
  onOpenNote: (noteId: string) => void;
}) {
  const query =
    part.input && typeof part.input.query === "string"
      ? part.input.query
      : undefined;

  if (part.state === "input-streaming" || part.state === "input-available") {
    return (
      <div className="flex items-center gap-2.5 rounded-xl border border-line bg-surface px-3 py-2.5">
        <span className="grid size-7 shrink-0 place-items-center rounded-lg bg-accent-soft text-accent">
          <Search className="size-3.5 animate-pulse" />
        </span>
        <div className="min-w-0">
          <p className="text-[11px] font-medium text-ink">
            Searching your notes…
          </p>
          {query && (
            <p className="mt-0.5 truncate text-[10.5px] text-muted">
              “{query}”
            </p>
          )}
        </div>
      </div>
    );
  }

  if (part.state === "output-available") {
    const { results } = part.output;

    if (results.length === 0) {
      return (
        <div className="flex items-start gap-2 rounded-xl border border-line bg-surface px-3 py-2.5">
          <span className="mt-0.5 grid size-6 shrink-0 place-items-center rounded-md bg-paper text-muted">
            <Search className="size-3" />
          </span>
          <div>
            <p className="text-[11px] font-medium text-ink">
              No matching notes
            </p>
            <p className="mt-0.5 text-[10.5px] leading-4 text-muted">
              {query
                ? `Nothing matched “${query}”.`
                : "Nothing matched that search."}
            </p>
          </div>
        </div>
      );
    }

    return (
      <div className="animate-rise overflow-hidden rounded-xl border border-line bg-surface shadow-sm">
        <div className="flex items-center gap-2 border-b border-line/80 px-3 py-2.5">
          <span className="grid size-6 shrink-0 place-items-center rounded-md bg-accent-soft text-accent">
            <Search className="size-3" />
          </span>
          <p className="text-[10px] font-medium uppercase tracking-[0.14em] text-muted">
            {results.length} {results.length === 1 ? "note" : "notes"} found
          </p>
        </div>
        <div className="divide-y divide-line/70">
          {results.map((result) => (
            <button
              key={result.id}
              type="button"
              onClick={() => onOpenNote(result.id)}
              className="group flex w-full items-start gap-2.5 px-3 py-2.5 text-left transition hover:bg-paper/60"
            >
              <span className="mt-0.5 grid size-6 shrink-0 place-items-center rounded-md bg-paper text-muted transition group-hover:text-accent">
                <FileText className="size-3" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[12px] font-medium text-ink">
                  {result.title}
                </span>
                {result.excerpt && (
                  <span className="mt-0.5 line-clamp-2 block text-[10.5px] leading-4 text-muted">
                    {result.excerpt}
                  </span>
                )}
              </span>
              <ArrowUpRight className="mt-1 size-3 shrink-0 text-muted transition group-hover:text-ink" />
            </button>
          ))}
        </div>
      </div>
    );
  }

  if (part.state === "output-error") {
    return (
      <div className="flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 px-3 py-2.5 text-[11px] leading-5 text-red-700">
        <AlertCircle className="mt-0.5 size-3.5 shrink-0" />
        <span>Couldn’t search your notes. {part.errorText}</span>
      </div>
    );
  }

  return null;
}
