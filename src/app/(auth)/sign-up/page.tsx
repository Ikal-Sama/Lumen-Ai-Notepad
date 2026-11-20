import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { AuthForm } from "@/components/auth/auth-form";
import { getSession } from "@/lib/session";

export const metadata: Metadata = {
  title: "Create an account",
};

// Auth pages read cookies + searchParams before rendering; let them block
// instead of prerendering an instant shell with a streamed redirect.
export const instant = false;

export default async function SignUpPage({
  searchParams,
}: {
  searchParams: Promise<{ add?: string; switch?: string }>;
}) {
  const params = await searchParams;
  const session = await getSession();
  const allowAdditional = params.add === "1" || params.switch === "1";
  if (session && !allowAdditional) redirect("/");

  return <AuthForm mode="sign-up" />;
}
