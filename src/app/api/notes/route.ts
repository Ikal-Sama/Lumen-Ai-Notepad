import { desc, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";

import { db } from "@/db";
import { notes } from "@/db/schema";
import { serializeNote } from "@/lib/notes";
import { getSession } from "@/lib/session";

const createNoteSchema = z.object({
  title: z.string().max(200).optional(),
  content: z.string().max(500_000).optional(),
});

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
  const content = parsed.data.content ?? "";

  const [note] = await db
    .insert(notes)
    .values({
      userId: session.user.id,
      title,
      content,
    })
    .returning();

  return NextResponse.json({ note: serializeNote(note) }, { status: 201 });
}
