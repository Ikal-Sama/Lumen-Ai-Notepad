"use client";

import { useEffect, useRef, useState } from "react";
import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport } from "ai";
import { Capacitor } from "@capacitor/core";
import { SpeechRecognition } from "@capacitor-community/speech-recognition";
import {
  AlertCircle,
  ArrowDown,
  ArrowUp,
  ArrowUpRight,
  Check,
  FileText,
  Image as ImageIcon,
  Loader2,
  Mic,
  MicOff,
  Paperclip,
  RotateCcw,
  Search,
  Sparkles,
  Square,
  X,
} from "lucide-react";

import { ConfirmDialog } from "@/components/workspace/confirm-dialog";
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
  openNote?: { id: string; title: string; content: string } | null;
  openNoteIsEncrypted?: boolean;
  searchableNotes?: Array<{ id: string; title: string; content: string; updatedAt: string }>;
  onBeforeSend: () => Promise<boolean>;
  onClose: () => void;
  onNoteCreated: (noteId: string) => void | Promise<void>;
  onNoteUpdated: (noteId: string) => void | Promise<void>;
  onOpenNote: (noteId: string) => void;
  onApplyCreateNote?: (output: { title: string; content: string }) => Promise<string>;
  onApplyMutation?: (output: { id: string; title: string; content: string }) => Promise<void>;
  registerSend?: (send: ((text: string) => void) | null) => void;
};

export function AiChatPanel({
  className,
  noteId,
  openNote,
  openNoteIsEncrypted = false,
  searchableNotes = [],
  onBeforeSend,
  onClose,
  onNoteCreated,
  onNoteUpdated,
  onOpenNote,
  onApplyCreateNote,
  onApplyMutation,
  registerSend,
}: AiChatPanelProps) {
  const [input, setInput] = useState("");
  const [attachments, setAttachments] = useState<File[]>([]);
  const [listening, setListening] = useState(false);
  const [speechSupported] = useState(() => {
    if (typeof window === "undefined") return false;
    if (Capacitor.isNativePlatform()) return true;
    const w = window as unknown as {
      SpeechRecognition?: unknown;
      webkitSpeechRecognition?: unknown;
    };
    if (w.SpeechRecognition || w.webkitSpeechRecognition) return true;
    return Boolean(
      typeof navigator !== "undefined" &&
        navigator.mediaDevices &&
        typeof navigator.mediaDevices.getUserMedia === "function" &&
        typeof MediaRecorder !== "undefined",
    );
  });
  const [sendError, setSendError] = useState<string | null>(null);
  const [preparing, setPreparing] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const recognitionRef = useRef<{ stop?: () => void | Promise<void> } | null>(null);
  const nativeRecognitionActiveRef = useRef(false);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const mediaChunksRef = useRef<Blob[]>([]);
  const webRecordingActiveRef = useRef(false);
  const dictationBaseRef = useRef("");
  const dictationFinalRef = useRef("");
  const createdRef = useRef(onNoteCreated);
  const updatedRef = useRef(onNoteUpdated);
  const applyCreateRef = useRef(onApplyCreateNote);
  const applyMutationRef = useRef(onApplyMutation);
  const submittingRef = useRef(false);
  const aiConsentNotesRef = useRef<Set<string>>(new Set());
  const [warningOpen, setWarningOpen] = useState(false);
  const pendingActionRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    createdRef.current = onNoteCreated;
    updatedRef.current = onNoteUpdated;
    applyCreateRef.current = onApplyCreateNote;
    applyMutationRef.current = onApplyMutation;
  }, [onNoteCreated, onNoteUpdated, onApplyCreateNote, onApplyMutation]);

  const { messages, sendMessage, status, error, stop, regenerate } =
    useChat<NoteUIMessage>({
      transport,
      onFinish: ({ message }) => {
        void (async () => {
          const created = new Set<string>();
          const updated = new Set<string>();

          for (const part of message.parts) {
            if (part.type === "tool-createNote" && part.state === "output-available") {
              if (applyCreateRef.current && part.output.content) {
                const id = await applyCreateRef.current({
                  title: part.output.title,
                  content: part.output.content,
                });
                created.add(id);
              } else {
                created.add(part.output.id);
              }
            } else if (
              (part.type === "tool-updateNote" || part.type === "tool-appendToNote") &&
              part.state === "output-available"
            ) {
              if (applyMutationRef.current && part.output.content) {
                await applyMutationRef.current({
                  id: part.output.id,
                  title: part.output.title,
                  content: part.output.content,
                });
              }
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
  const [pinned, setPinned] = useState(true);

  useEffect(() => {
    const element = scrollRef.current;
    if (!element) return;
    const onScroll = () => {
      const distance =
        element.scrollHeight - element.scrollTop - element.clientHeight;
      setPinned(distance < 80);
    };
    element.addEventListener("scroll", onScroll, { passive: true });
    return () => element.removeEventListener("scroll", onScroll);
  }, []);

  useEffect(() => {
    const element = scrollRef.current;
    if (!element || !pinned) return;
    element.scrollTop = element.scrollHeight;
  }, [messages, status, pinned]);

  useEffect(() => {
    const element = inputRef.current;
    if (!element) return;
    element.style.height = "auto";
    element.style.height = `${Math.min(element.scrollHeight, 132)}px`;
  }, [input, attachments.length]);

  useEffect(() => {
    return () => {
      try {
        if (nativeRecognitionActiveRef.current) {
          void SpeechRecognition.stop().catch(() => {});
          void SpeechRecognition.removeAllListeners().catch(() => {});
        } else if (webRecordingActiveRef.current && mediaRecorderRef.current) {
          try {
            if (mediaRecorderRef.current.state !== "inactive") mediaRecorderRef.current.stop();
          } catch {
            // ignore
          }
          mediaStreamRef.current?.getTracks().forEach((t) => t.stop());
        } else {
          const rec = recognitionRef.current as { stop?: () => void } | null;
          rec?.stop?.();
        }
      } catch {
        // ignore
      }
      recognitionRef.current = null;
      nativeRecognitionActiveRef.current = false;
      webRecordingActiveRef.current = false;
      mediaRecorderRef.current = null;
      mediaStreamRef.current = null;
      mediaChunksRef.current = [];
    };
  }, []);

  async function toggleVoiceDictation() {
    if (typeof window === "undefined") return;
    if (working) return;
    type SpeechRecognitionEventLike = {
      results: ArrayLike<
        ArrayLike<{ transcript: string }> & { isFinal: boolean; 0: { transcript: string } }
      >;
    };
    type SpeechRecognitionErrorLike = { error?: string };
    type SpeechRecognitionLike = {
      continuous: boolean;
      interimResults: boolean;
      lang: string;
      onstart: (() => void) | null;
      onresult: ((event: SpeechRecognitionEventLike) => void) | null;
      onerror: ((event: SpeechRecognitionErrorLike) => void) | null;
      onend: (() => void) | null;
      start: () => void;
      stop: () => void;
    };
    const w = window as unknown as {
      SpeechRecognition?: new () => SpeechRecognitionLike;
      webkitSpeechRecognition?: new () => SpeechRecognitionLike;
    };
    const SpeechRecognitionCtor = w.SpeechRecognition || w.webkitSpeechRecognition;

    if (listening || nativeRecognitionActiveRef.current || webRecordingActiveRef.current) {
      try {
        if (nativeRecognitionActiveRef.current) {
          nativeRecognitionActiveRef.current = false;
          await SpeechRecognition.stop().catch(() => {});
          await SpeechRecognition.removeAllListeners().catch(() => {});
          setListening(false);
        } else if (webRecordingActiveRef.current && mediaRecorderRef.current) {
          const recorder = mediaRecorderRef.current;
          if (recorder.state !== "inactive") recorder.stop();
          // onstop handler will finalize, transcribe, and reset state
          return;
        } else {
          await Promise.resolve(recognitionRef.current?.stop?.());
          setListening(false);
        }
      } catch {
        // ignore
      } finally {
        if (!webRecordingActiveRef.current) {
          recognitionRef.current = null;
          setListening(false);
        }
      }
      return;
    }

    if (Capacitor.isNativePlatform()) {
      try {
        setSendError(null);
        dictationBaseRef.current = input;
        dictationFinalRef.current = "";
        const perm = await SpeechRecognition.requestPermissions();
        const speechPerm = (perm as { speechRecognition?: string }).speechRecognition;
        if (speechPerm && speechPerm !== "granted") {
          setSendError("Microphone/speech permission is required for voice dictation.");
          return;
        }
        const availability = await SpeechRecognition.available().catch(() => ({ available: false }));
        if (!availability?.available) {
          setSendError("Voice dictation isn’t available on this device.");
          return;
        }

        await SpeechRecognition.removeAllListeners().catch(() => {});
        await SpeechRecognition.addListener("partialResults", (data: { matches: string[] }) => {
          const text = (data?.matches?.[0] ?? "").trim();
          if (!text) return;
          dictationFinalRef.current = text;
          const base = dictationBaseRef.current.replace(/\s+$/, "");
          setInput(base ? `${base} ${text}` : text);
        });
        await SpeechRecognition.addListener("listeningState", (data: { status: "started" | "stopped" }) => {
          if (data?.status === "started") setListening(true);
          if (data?.status === "stopped") {
            setListening(false);
            nativeRecognitionActiveRef.current = false;
          }
        });

        nativeRecognitionActiveRef.current = true;
        setListening(true);
        await SpeechRecognition.start({
          language: typeof navigator !== "undefined" ? navigator.language || "en-US" : "en-US",
          maxResults: 3,
          partialResults: true,
          popup: false,
        });
        return;
      } catch (err) {
        nativeRecognitionActiveRef.current = false;
        setListening(false);
        await SpeechRecognition.removeAllListeners().catch(() => {});
        const message = err instanceof Error ? err.message : String(err ?? "");
        if (/permission/i.test(message)) {
          setSendError("Microphone/speech permission is required for voice dictation.");
        } else {
          setSendError("Voice dictation couldn’t start on this device. Check microphone permission and try again.");
        }
        return;
      }
    }

    // Web: prefer MediaRecorder + server transcription (reliable, works like ChatGPT/Gemini)
    if (
      typeof navigator !== "undefined" &&
      navigator.mediaDevices?.getUserMedia &&
      typeof MediaRecorder !== "undefined"
    ) {
      try {
        setSendError(null);
        dictationBaseRef.current = input;
        mediaChunksRef.current = [];
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        mediaStreamRef.current = stream;
        const mimeCandidates = [
          "audio/webm;codecs=opus",
          "audio/webm",
          "audio/mp4",
          "audio/ogg;codecs=opus",
        ];
        const mimeType = mimeCandidates.find((m) => MediaRecorder.isTypeSupported(m));
        const recorder = mimeType
          ? new MediaRecorder(stream, { mimeType })
          : new MediaRecorder(stream);
        mediaRecorderRef.current = recorder;
        webRecordingActiveRef.current = true;

        recorder.ondataavailable = (event) => {
          if (event.data && event.data.size > 0) mediaChunksRef.current.push(event.data);
        };
        recorder.onerror = () => {
          setSendError("Voice recording failed. Please try again.");
        };
        recorder.onstop = async () => {
          const chunks = mediaChunksRef.current.slice();
          mediaChunksRef.current = [];
          webRecordingActiveRef.current = false;
          setListening(false);
          try {
            stream.getTracks().forEach((t) => t.stop());
          } catch {
            // ignore
          }
          mediaStreamRef.current = null;
          mediaRecorderRef.current = null;
          if (chunks.length === 0) return;

          const blob = new Blob(chunks, { type: recorder.mimeType || "audio/webm" });
          if (blob.size === 0) return;

          try {
            const form = new FormData();
            const ext = blob.type.includes("mp4")
              ? "mp4"
              : blob.type.includes("ogg")
                ? "ogg"
                : "webm";
            form.append("audio", blob, `dictation.${ext}`);
            const res = await fetch("/api/transcribe", { method: "POST", body: form });
            const data = (await res.json().catch(() => ({}))) as {
              text?: string;
              error?: string;
            };
            if (!res.ok) {
              setSendError(
                data?.error ||
                  "Voice dictation couldn’t be transcribed. Check transcription configuration and try again.",
              );
              return;
            }
            const transcript = String(data?.text ?? "").trim();
            if (!transcript) {
              setSendError("No speech detected. Try again and speak clearly.");
              return;
            }
            const base = dictationBaseRef.current.replace(/\s+$/, "");
            setInput(base ? `${base} ${transcript}` : transcript);
          } catch {
            setSendError("Voice dictation couldn’t be transcribed. Please try again.");
          }
        };

        recorder.start();
        setListening(true);
        return;
      } catch (err) {
        webRecordingActiveRef.current = false;
        setListening(false);
        try {
          mediaStreamRef.current?.getTracks().forEach((t) => t.stop());
        } catch {
          // ignore
        }
        mediaStreamRef.current = null;
        mediaRecorderRef.current = null;
        const name = err instanceof Error ? err.name : "";
        if (name === "NotAllowedError" || name === "SecurityError") {
          setSendError("Microphone access was blocked. Allow mic permission to use voice dictation.");
          return;
        }
        if (name === "NotFoundError") {
          setSendError("No microphone was found. Check your device mic and try again.");
          return;
        }
        // Fall through to Web SpeechRecognition fallback below if available
      }
    }

    if (!SpeechRecognitionCtor) {
      setSendError("Voice dictation isn’t supported in this browser.");
      return;
    }

    const recognition = new SpeechRecognitionCtor();
    recognitionRef.current = recognition;
    recognition.continuous = false;
    recognition.interimResults = true;
    recognition.lang =
      typeof navigator !== "undefined" ? navigator.language || "en-US" : "en-US";
    dictationBaseRef.current = input;
    setSendError(null);

    let finalTranscript = "";
    recognition.onstart = () => {
      setListening(true);
    };
    recognition.onresult = (event) => {
      let interim = "";
      for (let i = 0; i < event.results.length; i++) {
        const result = event.results[i];
        const transcript = result?.[0]?.transcript ?? "";
        if (result?.isFinal) finalTranscript += transcript;
        else interim += transcript;
      }
      const sessionText = `${finalTranscript}${interim}`.trim();
      const base = dictationBaseRef.current.replace(/\s+$/, "");
      setInput(sessionText ? (base ? `${base} ${sessionText}` : sessionText) : base);
    };
    recognition.onerror = (event) => {
      setListening(false);
      recognitionRef.current = null;
      const code = event?.error;
      if (code === "not-allowed" || code === "service-not-allowed") {
        setSendError("Microphone access was blocked. Allow mic permission to use voice dictation.");
      } else if (code === "no-speech") {
        setSendError("No speech detected. Try again and speak clearly.");
      } else if (code === "audio-capture") {
        setSendError("No microphone was found. Check your device mic and try again.");
      } else if (code === "network") {
        setSendError(
          "Voice dictation couldn’t reach the speech recognition service. This can happen even with internet access if the service is unavailable, blocked, or not supported in this WebView.",
        );
      } else if (code && code !== "aborted") {
        setSendError("Voice dictation couldn’t start. Please try again.");
      }
    };
    recognition.onend = () => {
      setListening(false);
      if (recognitionRef.current === recognition) recognitionRef.current = null;
    };

    try {
      recognition.start();
      setListening(true);
    } catch {
      setListening(false);
      recognitionRef.current = null;
      setSendError("Voice dictation couldn’t start in this browser.");
    }
  }

  function onPickFiles(event: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(event.target.files ?? []);
    if (files.length === 0) return;
    setAttachments((prev) => [...prev, ...files].slice(0, 10));
    event.target.value = "";
  }

  function removeAttachment(index: number) {
    setAttachments((prev) => prev.filter((_, i) => i !== index));
  }

  function requiresEncryptedNoteWarning() {
    return Boolean(openNoteIsEncrypted && noteId);
  }

  function hasAiContentConsent() {
    if (!requiresEncryptedNoteWarning() || !noteId) return true;
    return aiConsentNotesRef.current.has(noteId);
  }

  function requestWithConsent(action: () => void) {
    if (hasAiContentConsent()) {
      action();
      return;
    }
    pendingActionRef.current = action;
    setWarningOpen(true);
  }

  async function doSubmit(value: string, files: File[]) {
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
    setAttachments([]);
    const message =
      files.length > 0 ? { text: value || " ", files } : { text: value };
    void sendMessage(message as Parameters<typeof sendMessage>[0], {
      body: { noteId, openNote: openNote ?? null, searchableNotes },
    });
  }

  async function submit(text?: string) {
    const value = (text ?? input).trim();
    const files = [...attachments];
    if ((!value && files.length === 0) || busy || preparing || submittingRef.current)
      return;
    requestWithConsent(() => {
      void doSubmit(value || "Please analyze the attached file(s).", files);
    });
  }

  async function doRetry() {
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
    void regenerate({ body: { noteId, openNote: openNote ?? null, searchableNotes } });
  }

  async function retry() {
    if (busy || preparing || submittingRef.current) return;
    requestWithConsent(() => {
      void doRetry();
    });
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
      <ConfirmDialog
        open={warningOpen}
        tone="warning"
        title="Use AI with this encrypted note?"
        description="This note is encrypted. If you continue, its decrypted content may be sent to the AI service for this request. This confirmation is asked once per encrypted note for this session."
        confirmLabel="Continue"
        cancelLabel="Cancel"
        onCancel={() => {
          setWarningOpen(false);
          pendingActionRef.current = null;
        }}
        onConfirm={() => {
          if (noteId) aiConsentNotesRef.current.add(noteId);
          setWarningOpen(false);
          const pending = pendingActionRef.current;
          pendingActionRef.current = null;
          pending?.();
        }}
      />
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
      <div className="relative flex-1 overflow-hidden">
        <div ref={scrollRef} className="h-full overflow-y-auto">
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

                    const partType = (part as { type?: string }).type;
                    if (partType === "file" || partType === "image") {
                      const p = part as {
                        url?: string;
                        data?: string;
                        image?: string;
                        mediaType?: string;
                        mimeType?: string;
                        filename?: string;
                        name?: string;
                        type?: string;
                      };
                      const url = p.url || p.data || p.image;
                      const mediaType = p.mediaType || p.mimeType || "";
                      const name = p.filename || p.name || "Attachment";
                      const isImage =
                        (p.type === "image" || String(mediaType).startsWith("image/")) && url;
                      if (isImage) {
                        return (
                          <a
                            key={`${message.id}-file-${index}`}
                            href={url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className={cn(
                              "block overflow-hidden rounded-xl border border-line bg-surface",
                              isUser ? "max-w-[240px]" : "max-w-[280px]",
                            )}
                          >
                            {/* eslint-disable-next-line @next/next/no-img-element -- runtime attachment URL (blob/data) */}
                            <img
                              src={url}
                              alt={name}
                              className="max-h-48 w-full object-cover"
                            />
                          </a>
                        );
                      }
                      if (url) {
                        return (
                          <a
                            key={`${message.id}-file-${index}`}
                            href={url}
                            target={String(url).startsWith("data:") ? undefined : "_blank"}
                            rel="noopener noreferrer"
                            download={name}
                            className={cn(
                              "flex items-center gap-2 rounded-xl border px-3 py-2 text-[11.5px] transition",
                              isUser
                                ? "border-white/10 bg-white/10 text-surface hover:bg-white/15"
                                : "border-line bg-surface text-ink-soft hover:bg-paper/60 hover:text-ink",
                            )}
                          >
                            <FileText className="size-4 shrink-0 opacity-80" />
                            <span className="min-w-0 truncate">{name}</span>
                          </a>
                        );
                      }
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
        {!pinned && (
          <button
            type="button"
            onClick={() => {
              const element = scrollRef.current;
              if (element) element.scrollTop = element.scrollHeight;
              setPinned(true);
            }}
            className="absolute bottom-3 left-1/2 z-10 flex -translate-x-1/2 items-center gap-1.5 rounded-full border border-line bg-surface/95 px-3 py-1.5 text-[11.5px] font-medium text-ink-soft shadow-sm backdrop-blur transition hover:text-ink"
            aria-label="Scroll to latest message"
          >
            <ArrowDown className="size-3.5" />
            Latest
          </button>
        )}
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
          {attachments.length > 0 && (
            <div className="mb-1 flex flex-wrap gap-1.5 px-1 pt-1">
              {attachments.map((file, index) => (
                <span
                  key={`${file.name}-${file.size}-${index}`}
                  className="inline-flex max-w-full items-center gap-1.5 rounded-lg border border-line bg-[#faf8f3] px-2 py-1 text-[10.5px] text-ink-soft"
                >
                  {file.type.startsWith("image/") ? (
                    <ImageIcon className="size-3 shrink-0 text-muted" />
                  ) : (
                    <FileText className="size-3 shrink-0 text-muted" />
                  )}
                  <span className="max-w-[140px] truncate">{file.name}</span>
                  <button
                    type="button"
                    onClick={() => removeAttachment(index)}
                    className="grid size-4 place-items-center rounded text-muted transition hover:bg-white hover:text-ink"
                    aria-label={`Remove ${file.name}`}
                  >
                    <X className="size-3" />
                  </button>
                </span>
              ))}
            </div>
          )}
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
            placeholder="Ask anything, attach a file, or say “create a note…”"
            aria-label="Message the AI assistant"
            disabled={working}
            className="no-resize max-h-[132px] min-h-[42px] w-full overflow-y-auto bg-transparent px-2 py-2 text-[12.5px] leading-5 text-ink outline-none placeholder:text-muted/75 disabled:opacity-60"
          />
          <div className="flex items-center justify-between gap-2 px-1 pb-0.5 pt-1">
            <div className="flex items-center gap-0.5">
              <input
                ref={fileInputRef}
                type="file"
                multiple
                className="hidden"
                onChange={onPickFiles}
                accept="image/*,.txt,.md,.markdown,.pdf,.csv,.json"
              />
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={working}
                className="grid size-7 place-items-center rounded-lg text-muted transition hover:bg-[#f7f4ed] hover:text-ink disabled:opacity-50"
                aria-label="Attach files"
                title="Attach files"
              >
                <Paperclip className="size-4" />
              </button>
              <button
                type="button"
                onClick={toggleVoiceDictation}
                disabled={working}
                className={cn(
                  "relative grid size-7 place-items-center rounded-lg transition disabled:opacity-50",
                  listening
                    ? "bg-red-50 text-red-600 hover:bg-red-100"
                    : speechSupported
                      ? "text-muted hover:bg-[#f7f4ed] hover:text-ink"
                      : "text-muted/60 hover:bg-[#f7f4ed] hover:text-ink",
                )}
                aria-label={listening ? "Stop voice dictation" : "Start voice dictation"}
                title={
                  speechSupported
                    ? listening
                      ? "Listening… click to stop"
                      : "Dictate with voice"
                    : "Voice dictation not supported in this browser"
                }
              >
                {listening && (
                  <>
                    <span className="absolute inset-0 animate-ping rounded-lg bg-red-400/30" />
                    <span className="absolute -right-0.5 -top-0.5 size-2 animate-pulse rounded-full bg-red-500 ring-2 ring-surface" />
                  </>
                )}
                {listening ? <MicOff className="relative size-4" /> : <Mic className="size-4" />}
              </button>
              {listening && (
                <span className="ml-1 hidden items-center gap-1.5 text-[10px] font-medium text-red-600 sm:inline-flex">
                  <span className="size-1.5 animate-pulse rounded-full bg-red-500" />
                  Listening…
                </span>
              )}
              <p className="ml-1 hidden text-[9.5px] text-muted/90 sm:block">
                Enter to send · Shift+Enter for a new line
              </p>
            </div>
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
                disabled={(!input.trim() && attachments.length === 0) || working}
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
