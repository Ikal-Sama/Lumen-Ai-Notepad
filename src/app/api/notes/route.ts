import { desc, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";

import { db } from "@/db";
import { notes } from "@/db/schema";
import { serializeNote } from "@/lib/notes";
import { getSession } from "@/lib/session";

const createNoteSchema = z
  .object({
    title: z.string().max(200).optional(),
    content: z.string().max(500_000).optional(),
    contentCiphertext: z.string().max(2_000_000).optional().nullable(),
    contentIv: z.string().max(200).optional().nullable(),
    encryptionVersion: z.number().int().min(0).max(10).optional(),
  })
  .refine(
    (d) =>
      (d.encryptionVersion ?? 0) > 0
        ? Boolean(d.contentCiphertext && d.contentIv)
        : d.content !== undefined || d.title !== undefined || d.content === undefined,
    { message: "Invalid note payload." },
  );

export async function GET() {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const rows = await db
    .select()
    .from(notes)
    .where(eq(notes.userId, session.user.id))
    .orderBy(desc(notes.updatedAt));

  return NextResponse.json({ notes: rows.map(serializeNote) });
}

export async function POST(request: Request) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json().catch(() => ({}));
  const parsed = createNoteSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid note payload." },
      { status: 400 },
    );
  }

  const title = parsed.data.title?.trim() || "Untitled note";
  const encryptionVersion = parsed.data.encryptionVersion ?? 0;
  const encrypted = encryptionVersion > 0;

  const [note] = await db
    .insert(notes)
    .values({
      userId: session.user.id,
      title,
      content: encrypted ? "" : (parsed.data.content ?? ""),
      contentCiphertext: encrypted ? (parsed.data.contentCiphertext ?? null) : null,
      contentIv: encrypted ? (parsed.data.contentIv ?? null) : null,
      encryptionVersion,
    })
    .returning();

  return NextResponse.json({ note: serializeNote(note) }, { status: 201 });
}
