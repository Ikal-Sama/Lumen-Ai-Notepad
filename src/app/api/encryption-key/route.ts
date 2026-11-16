import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";

import { db } from "@/db";
import { userEncryptionKeys } from "@/db/schema";
import { getSession } from "@/lib/session";

const bundleSchema = z.object({
  kdfSalt: z.string().min(1),
  kdfIterations: z.number().int().positive(),
  wrappedDek: z.string().min(1),
  wrappedDekIv: z.string().min(1),
  recoveryWrappedDek: z.string().min(1),
  recoveryWrappedDekIv: z.string().min(1),
  verifierCiphertext: z.string().min(1),
  verifierIv: z.string().min(1),
  keyVersion: z.number().int().positive(),
});

export async function GET() {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const [row] = await db
    .select()
    .from(userEncryptionKeys)
    .where(eq(userEncryptionKeys.userId, session.user.id))
    .limit(1);

  if (!row) {
    return NextResponse.json({ bundle: null });
  }

  return NextResponse.json({
    bundle: {
      kdfSalt: row.kdfSalt,
      kdfIterations: row.kdfIterations,
      wrappedDek: row.wrappedDek,
      wrappedDekIv: row.wrappedDekIv,
      recoveryWrappedDek: row.recoveryWrappedDek,
      recoveryWrappedDekIv: row.recoveryWrappedDekIv,
      verifierCiphertext: row.verifierCiphertext,
      verifierIv: row.verifierIv,
      keyVersion: row.keyVersion,
    },
  });
}

export async function POST(request: Request) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  const parsed = bundleSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid key payload." },
      { status: 400 },
    );
  }

  const values = { userId: session.user.id, ...parsed.data };
  const [existing] = await db
    .select({ userId: userEncryptionKeys.userId })
    .from(userEncryptionKeys)
    .where(eq(userEncryptionKeys.userId, session.user.id))
    .limit(1);

  if (existing) {
    return NextResponse.json(
      {
        error:
          "An encryption key is already set for this account. Replacing it is not allowed because it can make existing encrypted notes unrecoverable. Use account recovery flows instead.",
      },
      { status: 409 },
    );
  }

  await db.insert(userEncryptionKeys).values(values);

  return NextResponse.json({ ok: true });
}
