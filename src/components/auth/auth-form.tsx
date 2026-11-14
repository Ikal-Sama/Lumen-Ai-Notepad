"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Capacitor } from "@capacitor/core";
import { SocialLogin } from "@capgo/capacitor-social-login";
import {
  AlertCircle,
  ArrowRight,
  Download,
  Eye,
  EyeOff,
  Loader2,
  Lock,
  Mail,
  User,
} from "lucide-react";

import { authClient } from "@/lib/auth-client";

let googleNativeInitialized = false;

type AuthFormProps = {
  mode: "sign-in" | "sign-up";
};

export function AuthForm({ mode }: AuthFormProps) {
  const router = useRouter();
  const isSignUp = mode === "sign-up";

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isNativeApp, setIsNativeApp] = useState(false);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- sync with Capacitor native runtime on mount
    setIsNativeApp(Capacitor.isNativePlatform());
  }, []);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    if (isSignUp && name.trim().length < 2) {
      setError("Please enter your name.");
      return;
    }
    if (!email.trim()) {
      setError("Please enter your email address.");
      return;
    }
    if (password.length < 8) {
      setError("Password must be at least 8 characters long.");
      return;
    }

    setLoading(true);

    const result = isSignUp
      ? await authClient.signUp.email({
        name: name.trim(),
        email: email.trim(),
        password,
      })
      : await authClient.signIn.email({
        email: email.trim(),
        password,
      });

    if (result.error) {
      setError(
        result.error.message ??
        (isSignUp
          ? "We couldn't create your account. Please try again."
          : "That email and password combination doesn't look right."),
      );
      setLoading(false);
      return;
    }

    router.push("/");
    router.refresh();
  }

  async function handleGoogleSignIn() {
    setError(null);
    setLoading(true);

    try {
      if (isNativeApp) {
        const webClientId =
          process.env.NEXT_PUBLIC_GOOGLE_WEB_CLIENT_ID ||
          process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID;

        if (!webClientId) {
          setError(
            "Google sign-in isn't configured for the mobile app. Set NEXT_PUBLIC_GOOGLE_WEB_CLIENT_ID (your Google Web client ID) and redeploy.",
          );
          return;
        }

        if (!googleNativeInitialized) {
          await SocialLogin.initialize({
            google: {
              webClientId,
            },
          });
          googleNativeInitialized = true;
        }

        const loginRes = await SocialLogin.login({
          provider: "google",
          options: {},
        });

        const result = loginRes.result as {
          responseType?: string;
          idToken?: string | null;
          accessToken?: { token?: string | null } | string | null;
        };

        if (result?.responseType && result.responseType !== "online") {
          setError(
            "Google sign-in did not return an ID token. Ensure the native Google sign-in is configured for online mode.",
          );
          return;
        }

        const idToken = result?.idToken ?? null;
        const accessToken =
          typeof result?.accessToken === "string"
            ? result.accessToken
            : (result?.accessToken?.token ?? undefined);

        if (!idToken) {
          setError(
            "Google sign-in failed: no ID token was returned. Check your Android Google Sign-In configuration (Web client ID, SHA-1, package name).",
          );
          return;
        }

        const signInResult = await authClient.signIn.social({
          provider: "google",
          idToken: {
            token: idToken,
            ...(accessToken ? { accessToken } : {}),
          },
        });

        if (signInResult.error) {
          setError(
            signInResult.error.message ??
              "Google sign-in failed. Please try again.",
          );
          return;
        }

        router.push("/");
        router.refresh();
        return;
      }

      const result = await authClient.signIn.social({
        provider: "google",
        callbackURL: "/",
      });

      if (result.error) {
        setError(
          result.error.message ??
            "Google sign-in isn't configured. Add GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET to .env.local, then restart the server.",
        );
        return;
      }
    } catch (err) {
      const message =
        err instanceof Error
          ? err.message
          : "Google sign-in failed. Please try again.";
      setError(message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="animate-rise">
      <div className="mb-8">
        <p className="mb-3 text-[11px] font-medium uppercase tracking-[0.22em] text-accent">
          {isSignUp ? "Create your space" : "Welcome back"}
        </p>
        <h2 className="font-serif text-[34px] leading-[1.05] tracking-tight text-ink sm:text-[42px]">
          {isSignUp ? "Make room for ideas." : "Pick up where you left off."}
        </h2>
        <p className="mt-3 text-[13.5px] leading-6 text-ink-soft">
          {isSignUp
            ? "One quiet place for your notes, plans, and the thoughts still taking shape."
            : "Sign in to open your notebook and continue the conversation."}
        </p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4" noValidate>
        {isSignUp && (
          <div className="space-y-1.5">
            <label
              htmlFor="name"
              className="text-[12px] font-medium text-ink-soft"
            >
              Name
            </label>
            <div className="relative">
              <User className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-muted" />
              <input
                id="name"
                name="name"
                type="text"
                autoComplete="name"
                placeholder="Ada Lovelace"
                value={name}
                onChange={(event) => setName(event.target.value)}
                disabled={loading}
                className="h-11 w-full rounded-xl border border-line bg-surface pl-10 pr-3.5 text-[13.5px] text-ink outline-none transition placeholder:text-muted/70 focus:border-accent/40 focus:ring-4 focus:ring-accent/10 disabled:opacity-60"
              />
            </div>
          </div>
        )}

        <div className="space-y-1.5">
          <label
            htmlFor="email"
            className="text-[12px] font-medium text-ink-soft"
          >
            Email
          </label>
          <div className="relative">
            <Mail className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-muted" />
            <input
              id="email"
              name="email"
              type="email"
              autoComplete="email"
              placeholder="you@example.com"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              disabled={loading}
              className="h-11 w-full rounded-xl border border-line bg-surface pl-10 pr-3.5 text-[13.5px] text-ink outline-none transition placeholder:text-muted/70 focus:border-accent/40 focus:ring-4 focus:ring-accent/10 disabled:opacity-60"
            />
          </div>
        </div>

        <div className="space-y-1.5">
          <label
            htmlFor="password"
            className="text-[12px] font-medium text-ink-soft"
          >
            Password
          </label>
          <div className="relative">
            <Lock className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-muted" />
            <input
              id="password"
              name="password"
              type={showPassword ? "text" : "password"}
              autoComplete={isSignUp ? "new-password" : "current-password"}
              placeholder={isSignUp ? "At least 8 characters" : "Your password"}
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              disabled={loading}
              className="h-11 w-full rounded-xl border border-line bg-surface pl-10 pr-11 text-[13.5px] text-ink outline-none transition placeholder:text-muted/70 focus:border-accent/40 focus:ring-4 focus:ring-accent/10 disabled:opacity-60"
            />
            <button
              type="button"
              onClick={() => setShowPassword((value) => !value)}
              className="absolute right-2 top-1/2 grid size-8 -translate-y-1/2 place-items-center rounded-lg text-muted transition hover:bg-paper hover:text-ink-soft"
              aria-label={showPassword ? "Hide password" : "Show password"}
            >
              {showPassword ? (
                <EyeOff className="size-4" />
              ) : (
                <Eye className="size-4" />
              )}
            </button>
          </div>
        </div>

        {error && (
          <div
            role="alert"
            className="flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 px-3.5 py-3 text-[12.5px] leading-5 text-red-700"
          >
            <AlertCircle className="mt-0.5 size-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        <button
          type="submit"
          disabled={loading}
          className="group mt-2 flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-ink px-4 text-[13.5px] font-medium text-surface transition hover:bg-[#35312a] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-accent/20 disabled:cursor-not-allowed disabled:opacity-70"
        >
          {loading ? (
            <Loader2 className="size-4 animate-spin" />
          ) : (
            <>
              {isSignUp ? "Create account" : "Sign in"}
              <ArrowRight className="size-4 transition-transform group-hover:translate-x-0.5" />
            </>
          )}
        </button>

        <div className="flex items-center gap-3 py-1">
          <span className="h-px flex-1 bg-line" />
          <span className="text-[10.5px] uppercase tracking-[0.18em] text-muted">
            or
          </span>
          <span className="h-px flex-1 bg-line" />
        </div>

        <button
          type="button"
          onClick={handleGoogleSignIn}
          disabled={loading}
          className="flex h-11 w-full items-center justify-center gap-2.5 rounded-xl border border-line bg-surface px-4 text-[13.5px] font-medium text-ink transition hover:border-line-strong hover:bg-paper focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-accent/20 disabled:cursor-not-allowed disabled:opacity-70"
        >
          {loading ? (
            <Loader2 className="size-4 animate-spin" />
          ) : (
            <>
              <GoogleIcon className="size-4" />
              Continue with Google
            </>
          )}
        </button>
      </form>

      {!isNativeApp && (
        <div className="mt-4 flex justify-center">
          <a
            href="/app-debug.apk"
            download
            className="flex h-10 items-center gap-2 rounded-xl border border-line bg-surface px-4 text-[12.5px] font-medium text-ink-soft transition hover:border-line-strong hover:text-ink focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-accent/20"
          >
            <Download className="size-4" />
            Download Android app
          </a>
        </div>
      )}

      <p className="mt-6 text-center text-[12.5px] text-ink-soft">
        {isSignUp ? "Already have a notebook?" : "New to Lumen?"}{" "}
        <Link
          href={isSignUp ? "/sign-in" : "/sign-up"}
          className="font-medium text-accent-deep underline decoration-accent/30 underline-offset-4 transition hover:decoration-accent"
        >
          {isSignUp ? "Sign in" : "Create an account"}
        </Link>
      </p>

      {isSignUp && (
        <p className="mt-8 text-center text-[11px] leading-5 text-muted">
          By creating an account you agree to keep your best ideas coming.
          <br />
          Your notes are private to your account.
        </p>
      )}
    </div>
  );
}

function GoogleIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      aria-hidden="true"
      focusable="false"
    >
      <path
        fill="#4285F4"
        d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
      />
      <path
        fill="#34A853"
        d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
      />
      <path
        fill="#FBBC05"
        d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z"
      />
      <path
        fill="#EA4335"
        d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
      />
    </svg>
  );
}
