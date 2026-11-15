import { desc, eq } from "drizzle-orm";
import { redirect } from "next/navigation";

import { Workspace } from "@/components/workspace/workspace";
import { E2eeProvider } from "@/lib/e2ee/context";
import { db } from "@/db";
import { notes } from "@/db/schema";
import { serializeNote } from "@/lib/notes";
import { getSession } from "@/lib/session";

export default async function HomePage() {
  const session = await getSession();
  if (!session) redirect("/sign-in");

  const rows = await db
    .select()
    .from(notes)
    .where(eq(notes.userId, session.user.id))
    .orderBy(desc(notes.updatedAt));

  return (
    <E2eeProvider>
      <Workspace
        user={{
          id: session.user.id,
          name: session.user.name,
          email: session.user.email,
          image: session.user.image,
        }}
        initialNotes={rows.map(serializeNote)}
      />
    </E2eeProvider>
  );
}
