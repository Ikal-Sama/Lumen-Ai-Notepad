import type { NoteRow } from "@/db/schema";
import type { Note } from "./types";

export function serializeNote(note: NoteRow): Note {
  const encrypted = (note.encryptionVersion ?? 0) > 0;
  return {
    id: note.id,
    title: note.title,
    content: encrypted ? "" : note.content,
    createdAt: note.createdAt.toISOString(),
    updatedAt: note.updatedAt.toISOString(),
    encryptionVersion: note.encryptionVersion ?? 0,
    contentCiphertext: note.contentCiphertext ?? null,
    contentIv: note.contentIv ?? null,
    decrypted: !encrypted,
  };
}

export function serializeLegacyPlaintextNote(note: NoteRow): Note {
  return {
    id: note.id,
    title: note.title,
    content: note.content,
    createdAt: note.createdAt.toISOString(),
    updatedAt: note.updatedAt.toISOString(),
    encryptionVersion: 0,
    contentCiphertext: null,
    contentIv: null,
    decrypted: true,
  };
}

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function isUuid(value: string): boolean {
  return UUID_PATTERN.test(value);
}
