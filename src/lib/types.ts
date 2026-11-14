import type { UIDataTypes, UIMessage } from "ai";

export type Note = {
  id: string;
  title: string;
  content: string;
  createdAt: string;
  updatedAt: string;
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
};

export type NoteMutationOutput = {
  id: string;
  title: string;
  updatedAt: string;
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
