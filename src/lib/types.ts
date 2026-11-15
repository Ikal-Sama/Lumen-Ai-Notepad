import type { UIDataTypes, UIMessage } from "ai";

export type Note = {
  id: string;
  title: string;
  /** Plaintext content when decrypted/legacy; may be empty for locked encrypted notes. */
  content: string;
  createdAt: string;
  updatedAt: string;
  encryptionVersion?: number;
  contentCiphertext?: string | null;
  contentIv?: string | null;
  /** Client-side flag: true when encrypted content has been decrypted in memory. */
  decrypted?: boolean;
};

export type WorkspaceUser = {
  id: string;
  name: string;
  email: string;
  image?: string | null;
};

export type CreateNoteOutput = {
  id: string;
  title: string;
  content?: string;
  saved?: boolean;
  action?: "create";
};

export type NoteMutationOutput = {
  id: string;
  title: string;
  updatedAt: string;
  content?: string;
  action?: "update" | "append";
};

export type NoteSearchResult = {
  id: string;
  title: string;
  excerpt: string;
  content: string;
  truncated: boolean;
  updatedAt: string;
};

export type NoteSearchOutput = {
  results: NoteSearchResult[];
};

/**
 * Typed tool set for UI messages. This mirrors the tools defined in
 * `src/app/api/chat/route.ts` so the chat panel can safely read their output.
 */
export type NoteUITools = {
  createNote: {
    input: { title: string; content: string };
    output: CreateNoteOutput;
  };
  updateNote: {
    input: { title?: string; content: string };
    output: NoteMutationOutput;
  };
  appendToNote: {
    input: { content: string };
    output: NoteMutationOutput;
  };
  searchNotes: {
    input: { query: string };
    output: NoteSearchOutput;
  };
};

export type NoteUIMessage = UIMessage<never, UIDataTypes, NoteUITools>;
