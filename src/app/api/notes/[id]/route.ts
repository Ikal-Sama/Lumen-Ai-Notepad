import { and, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";

import { db } from "@/db";
import { notes } from "@/db/schema";
import { isUuid, serializeNote } from "@/lib/notes";
import { getSession } from "@/lib/session";

type RouteContext = {
  params: Promise<{ id: string }>;
};

const updateNoteSchema = z
  .object({
    title: z.string().max(200).optional(),
    content: z.string().max(500_000).optional(),
    contentCiphertext: z.string().max(2_000_000).optional().nullable(),
    contentIv: z.string().max(200).optional().nullable(),
    encryptionVersion: z.number().int().min(0).max(10).optional(),
  })
  .refine(
    (d) =>
      d.title !== undefined ||
      d.content !== undefined ||
      d.contentCiphertext !== undefined ||
      d.contentIv !== undefined ||
      d.encryptionVersion !== undefined,
    { message: "Provide a title or content to update." },
  );

export async function GET(_request: Request, context: RouteContext) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await context.params;
  if (!isUuid(id)) {
    return NextResponse.json({ error: "Note not found." }, { status: 404 });
  }

  const [note] = await db
    .select()
    .from(notes)
    .where(and(eq(notes.id, id), eq(notes.userId, session.user.id)))
    .limit(1);

  if (!note) {
    return NextResponse.json({ error: "Note not found." }, { status: 404 });
  }

  return NextResponse.json({ note: serializeNote(note) });
}

export async function PATCH(request: Request, context: RouteContext) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await context.params;
  if (!isUuid(id)) {
    return NextResponse.json({ error: "Note not found." }, { status: 404 });
  }

  const body = await request.json().catch(() => null);
  const parsed = updateNoteSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid note payload." },
      { status: 400 },
    );
  }

  const updates: {
    title?: string;
    content?: string;
    contentCiphertext?: string | null;
    contentIv?: string | null;
    encryptionVersion?: number;
  } = {};

  if (parsed.data.title !== undefined) {
    updates.title = parsed.data.title;
  }

  const encryptionVersion = parsed.data.encryptionVersion;
  if (encryptionVersion !== undefined && encryptionVersion > 0) {
    updates.encryptionVersion = encryptionVersion;
    updates.content = "";
    updates.contentCiphertext = parsed.data.contentCiphertext ?? null;
    updates.contentIv = parsed.data.contentIv ?? null;
  } else if (parsed.data.content !== undefined) {
    updates.content = parsed.data.content;
    if (encryptionVersion === 0) {
      updates.encryptionVersion = 0;
      updates.contentCiphertext = null;
      updates.contentIv = null;
    }
  }

  const [note] = await db
    .update(notes)
    .set(updates)
    .where(and(eq(notes.id, id), eq(notes.userId, session.user.id)))
    .returning();

  if (!note) {
    return NextResponse.json({ error: "Note not found." }, { status: 404 });
  }

  return NextResponse.json({ note: serializeNote(note) });
}

export async function DELETE(_request: Request, context: RouteContext) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await context.params;
  if (!isUuid(id)) {
    return NextResponse.json({ error: "Note not found." }, { status: 404 });
  }

  const [deleted] = await db
    .delete(notes)
    .where(and(eq(notes.id, id), eq(notes.userId, session.user.id)))
    .returning({ id: notes.id });

  if (!deleted) {
    return NextResponse.json({ error: "Note not found." }, { status: 404 });
  }

  return NextResponse.json({ success: true, id: deleted.id });
}
