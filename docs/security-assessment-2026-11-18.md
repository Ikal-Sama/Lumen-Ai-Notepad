# Security Assessment — Lumen (AINoteApp)

**Date:** 2026-11-18
**Assessed by:** AI agent (static review + non-destructive runtime testing)
**Targets:** local source, local dev server, local production build (`next start`), live deployment `https://lumen-ai-notepad.vercel.app`, shipped Android APK
**Related:** [`docs/security-and-bug-review.md`](./security-and-bug-review.md) (2026-11-16 source review)

---

## 1. Verdict (short version)

**No critical, anonymously exploitable vulnerability was found.** The core isolation is solid:

- Every notes / encryption-key / chat / transcription route rejects unauthenticated requests (`401`) before touching data or calling a paid AI model — verified against both the local build and the live deployment.
- Notes are scoped with `WHERE user_id = session.user.id`, IDs are UUID-validated, and cross-user IDs in the chat route are filtered against the caller's own notes. No IDOR, SQL injection, or stored XSS was found.
- No server secrets are present in client bundles; `.env.local` was never committed.

However, the app is **not hardened against abuse**, and three issues are realistic attack paths for a public deployment:

| # | Severity | Finding | Exploitable by |
|---|---|---|---|
| H1 | **High** | Account pre-registration → Google account-linking takeover | Anyone who knows a victim's email |
| H2 | **High** | Publicly hosted **debug-signed, debuggable APKs** (`/lumen.apk`, `/app-debug.apk`) | Anyone who can install the APK |
| H3 | **High** | Open signup + no quota/rate limit on AI endpoints → cost/financial DoS | Anyone on the internet |
| M1 | Medium | Auth-dependent HTML publicly CDN-cached on the live deployment | Anyone (cache poisoning / redirect loop) |
| M2 | Medium | Unlocked encrypted notes are sent to the AI via `searchNotes` without the encrypted-note consent warning | Any user (privacy) |
| M3 | Medium | E2EE key lifecycle footguns (unverified setup password, password change, key squatting, offline guessing) | Stolen session / user error |
| M4 | Medium | AI-created notes are always plaintext, even when derived from an encrypted note | Any user (privacy) |
| M5 | Medium | Missing security headers (CSP, frame-ancestors, nosniff, Referrer-Policy) | Clickjacking / defense-in-depth |
| L1–L7 | Low | See §5 | — |

**Bottom line:** an anonymous attacker **cannot read other users' notes**, but a determined attacker can (a) take over accounts that sign in with Google, (b) distribute a trojaned Android build that looks identical to yours, or (c) burn through your OpenAI/Google credits. Those three should be fixed before any wider release.

---

## 2. Scope and method

**Performed**

- Full source review of `src/app/api/**`, `src/lib/**`, `src/components/**`, `next.config.ts`, `android/**`.
- `npm audit` (744 packages).
- Local dev server (`next dev`) and local production server (`next start`) probing: auth enforcement, method handling, headers, validation.
- Read-only probing of the live deployment: headers, `/api/*` auth enforcement, sign-in rate limiting (5 failed attempts against a non-existent address).
- APK inspection with `apksigner verify --print-certs` and `aapt2 dump badging`.
- Build/quality gate: `npm run lint` (0 errors, 24 pre-existing warnings), `npm run typecheck` (pass), `npm run build` (pass).

**Not performed (deliberately)**

- No accounts were created on the production database, so authenticated IDOR/mass-assignment tests were assessed by code review only.
- No fuzzing, no DoS traffic, no writes beyond 5 failed login attempts, no third-party infrastructure testing.
- No destructive tests against the live site or database.

---

## 3. High severity

### H1 — Account pre-registration enables Google account-linking takeover

**Location:** `src/lib/auth.ts:33-39`

```ts
account: {
  accountLinking: {
    enabled: true,
    trustedProviders: ["google"],
    requireLocalEmailVerified: false,   // <-- dangerous without email verification
  },
},
```

**Evidence**

- `emailAndPassword` is enabled (`auth.ts:27-32`) but **no email verification is configured** (no `emailVerification` block, no `requireEmailVerification`). Local accounts therefore never have `emailVerified = true`.
- Better Auth's default for `requireLocalEmailVerified` is `true`:
  `node_modules/better-auth/dist/oauth2/link-account.mjs:169`
- With `false`, linking is allowed when the provider is trusted (`google`) **and** the local email is unverified. This is exactly the state the app runs in.

**Attack**

1. Attacker registers `victim@gmail.com` with a password the attacker controls (signup requires no email confirmation).
2. Victim later clicks “Continue with Google” for the same address.
3. Better Auth finds the existing user by email and links the Google account to it (trusted provider + `requireLocalEmailVerified: false`).
4. Both parties now share one account. The attacker keeps password access and can read every note the victim creates, and impersonate them in future sessions.

Existing victim data is not retroactively exposed (the squatted account must not already exist), but this is a full account takeover for future use and a serious integrity failure.

**Fix**

- Set `requireLocalEmailVerified: true` (the default) **or** remove the option.
- Enable email verification (`emailVerification.sendVerificationEmail` + `emailAndPassword.requireEmailVerification: true`) before allowing linking.
- Consider `accountLinking.disableImplicitLinking: true` and require an explicit “link account” action from a signed-in session.

---

### H2 — Debug-signed, debuggable APKs are served publicly

**Location:** `public/lumen.apk` (tracked in git, linked from the sign-in page at `src/components/auth/auth-form.tsx:347-354`), plus a leftover `public/app-debug.apk` still reachable on the live site.

**Evidence**

```
apksigner verify --print-certs public/lumen.apk
  Signer #1 certificate DN: C=US, O=Android, CN=Android Debug
aapt2 dump badging public/lumen.apk
  application-debuggable
  android:allowBackup="true"
```

Live checks:

```
HEAD https://lumen-ai-notepad.vercel.app/lumen.apk       -> 200  (87.6 MB)
HEAD https://lumen-ai-notepad.vercel.app/app-debug.apk   -> 200  (40.2 MB)
```

`android/app/src/main/java/com/lumen/notes/MainActivity.java` additionally forces cookies/third-party cookies on and flushes them to persistent disk.

**Impact**

- `android:debuggable="true"` lets anyone with USB debugging (or root) run `adb shell run-as com.lumen.notes`, attach a debugger, or pull the WebView cookie database — i.e. steal the Better Auth session cookie and take over the account.
- `android:allowBackup="true"` without backup rules allows app data (including WebView storage/cookies) to be extracted through backup mechanisms on supported OS versions.
- The **Android debug keystore is public and well known** (`CN=Android Debug`). Anyone can sign a modified APK with the same certificate, so a trojaned build is indistinguishable from the official download by signature; the app also cannot be published to Play with this key.
- The APK loads a remote URL (`capacitor.config.ts:8`), so the build is a thin shell — but the shell still controls cookies, permissions, and future native plugins.

**Fix**

- Build and distribute a **release** APK (release keystore, `minifyEnabled` as appropriate); verify `application-debuggable` is absent.
- Set `android:allowBackup="false"` (or provide `fullBackupContent`/`dataExtractionRules` excluding WebView data).
- Remove `/lumen.apk`, `/app-debug.apk` and any debug artifacts from `public/` and from git history; serve releases via Play App Signing or a signed, checksummed download.
- Consider not accepting third-party cookies in the WebView.

---

### H3 — Open signup + unthrottled AI endpoints = cost/financial DoS

**Location:** `src/app/api/chat/route.ts`, `src/app/api/transcribe/route.ts`, `src/lib/auth.ts`

**Evidence**

- Signup requires only `name`, `email`, `password` — no verification, no CAPTCHA, no invite (`auth.ts:27-32`).
- Better Auth rate limiting only covers `/api/auth/*` paths (`node_modules/better-auth/dist/api/rate-limiter/index.mjs:305-318`); `/api/chat` and `/api/transcribe` have **no rate limit or per-user quota**. Verified: the 4th bad sign-in within 10 s returns `429`, while the AI routes are only session-gated.
- Chat accepts (per request): 60 messages, an open note up to 200,000 chars, and up to **100 searchable notes × 200,000 chars** (`chat/route.ts:23-28, 128-167`). Only per-note length is capped, not the total.
- No upload/size/MIME validation on chat attachments (client allows 10 files of any size, `ai-chat-panel.tsx:492-496`); the JSON body is forwarded to the provider.
- Transcribe accepts audio up to 20 MB and forwards it to Whisper/Gemini.

**Attack**

1. Create accounts with disposable addresses (no email verification).
2. Loop `/api/chat` with large `searchableNotes` payloads (or `/api/transcribe` with 20 MB audio) to consume model tokens/credits.
3. Repeat from multiple IPs; rate limits on auth paths are per-IP only and do not apply to the AI routes.

Platform constraints (Vercel’s default 4.5 MB request body, provider context windows, provider rate limits) reduce per-request damage, but do not remove the abuse: request volume and account count are unbounded, and the bill is yours.

**Fix**

- Enable email verification + CAPTCHA on signup and login.
- Add per-user and per-IP rate limits/quotas to `/api/chat` and `/api/transcribe` (e.g. Upstash Ratelimit/Vercel KV) and daily token budgets per account.
- Cap **total** context (`openNote` + all searchable notes), not just each item; add `Content-Length` limits.
- Enforce attachment count/size/MIME server-side; reject oversized bodies before parsing.
- Log per-user usage and alert on spikes.

---

## 4. Medium severity

### M1 — Auth-dependent pages are publicly CDN-cached on the live deployment

**Evidence (live, anonymous):**

```
GET https://lumen-ai-notepad.vercel.app/
  HTTP 200
  cache-control: public, max-age=0, must-revalidate
  x-vercel-cache: HIT
  age: 171268            (~47 hours)
  Vary: rsc, next-router-state-tree, next-router-prefetch,
        next-router-segment-prefetch          (no Cookie)
  body: NEXT_REDIRECT;replace;/sign-in  + <meta http-equiv="refresh" ... /sign-in>
```

The same cached body was returned when sending `Cookie: better-auth.session_token=bogus`, confirming the cache key ignores session cookies. `/sign-in` and `/sign-up` are cached the same way (`age` up to ~42 h).

A fresh local production build (`next build` + `next start`) serves the same routes with `cache-control: private, no-cache, no-store`, and the build output marks `/`, `/sign-in`, `/sign-up` as **Partial Prerender** (`◐`). The build also emits:

> `Error: Route "/sign-in": Next.js encountered URL data during prerendering or a navigation. params or searchParams accessed outside of <Suspense> …`

**Impact**

- At minimum, the live deployment serves every visitor — including logged-in users, since cookies are not part of the cache key — a cached redirect to `/sign-in`. That breaks hard reloads/deep links for authenticated users.
- More seriously, `public` + no `Vary: Cookie` on an auth-dependent route is a cache-poisoning/cross-user-exposure pattern. If any response for `/` ever renders user data, it can be cached and served to other users. Do not rely on the current anonymous redirect as a safeguard.
- The stale body/headers indicate the live deployment may not match the current build; verify the deployed commit.

**Fix**

- Redeploy the current build and confirm the live headers say `private, no-store`.
- Explicitly set `Cache-Control: private, no-cache, no-store, max-age=0` (and `CDN-Cache-Control: private`) for authenticated HTML, or add `Vary: Cookie`.
- Wrap session-dependent UI in `<Suspense>` or set `export const instant = false` on routes that read cookies/search params (resolves the Next warning).
- Verify after deploy: `curl -I /` twice and `curl -I -H 'Cookie: <valid session>' /` must both be private/no-store and must not be `HIT`.

---

### M2 — Encrypted notes are searchable by the AI without the consent warning

**Location:** `src/components/workspace/workspace.tsx:545-552`, `src/components/workspace/ai-chat-panel.tsx:503-519`

The per-note warning (`openNoteIsEncrypted && noteId`) only fires when the **currently open** note is encrypted. However, the search corpus is built from **all notes whose `decrypted !== false`**:

```tsx
searchableNotes={notes
  .filter((n) => n.decrypted !== false)
  .map((n) => ({ id: n.id, title: n.title, content: n.content, updatedAt: n.updatedAt }))}
```

After a user unlocks encrypted notes once, those notes stay decrypted in memory. If they then chat with a plaintext note open (or no note open), the decrypted ciphertext notes are included in the corpus; if the model calls `searchNotes`, their plaintext is sent to the AI provider — **without the warning the UI promises** (“This note is encrypted… may be sent to the AI service”).

This also transmits every decrypted note body to the app server on each chat turn, defeating the “server never sees encrypted note plaintext” property for the duration of the session.

**Fix**

- Require explicit consent before including **any** encrypted note in `searchableNotes` (track consent per note, not per open note).
- Prefer sending only titles/snippets, or run search client-side and send only matched excerpts.
- Update the README/privacy copy to match actual behavior.

---

### M3 — E2EE key lifecycle has data-loss and denial-of-service footguns

**Locations:** `src/lib/e2ee/crypto.ts`, `src/lib/e2ee/context.tsx:53-66`, `src/app/api/encryption-key/route.ts`, `src/lib/auth.ts`

1. **Setup password is not verified.** `setupWithPassword()` derives the KEK from whatever string the dialog receives; it never checks it against the account password. The UI says “Enter your account password”, so a typo silently creates a KEK the user cannot reproduce. The only recovery is the one-time recovery key. (For Google-only accounts there is no password at all; any 8+ chars become the KEK.)
2. **Changing the account password breaks decryption.** `/api/auth/change-password` is enabled by default (verified: `HTTP 400` validation response). Nothing re-wraps `wrappedDek`/`recoveryWrappedDek` with a KEK derived from the new password, so after a password change all encrypted notes become unreadable unless the recovery key was saved. No warning is shown.
3. **First-bundle squatting is permanent.** `POST /api/encryption-key` rejects replacement once a row exists (`409`). A hijacked session can create the first bundle (with a password the attacker knows) before the legitimate user does; the legitimate user can then never set up E2EE on that account, and can never unlock it.
4. **Offline guessing.** A stolen session (or DB dump) exposes `kdfSalt`, `wrappedDek` and `verifierCiphertext`. The KEK is PBKDF2-SHA-256 with 310k iterations over the **login password** (`minPasswordLength: 8`). Weak/reused passwords are crackable offline with no server-side rate limit, because the verifier gives a local oracle.

**Fix**

- Verify the password server-side (or re-authenticate) before creating the bundle; or use a dedicated encryption passphrase with a zxcvbn strength floor.
- Re-wrap the DEK on password change, or explicitly block password change while a bundle exists and warn the user.
- Require proof of possession (current unlock) for key replacement, and design a verified rotation/recovery flow.
- Consider Argon2id (WASM) instead of PBKDF2 and a separate stronger passphrase; keep the recovery key flow.
- Document that losing both password and recovery key means permanent data loss.

---

### M4 — AI-created notes are always plaintext, even from encrypted sources

**Location:** `src/components/workspace/workspace.tsx:561-572`

```tsx
onApplyCreateNote={async ({ title, content }) => {
  ... body: JSON.stringify({ title, content, encryptionVersion: 0 })
}}
```

If a user asks the AI to “summarize this encrypted note into a new note”, the summary is written to the DB **in plaintext**, even though the source was encrypted. The README states “AI-assisted mutations preserve the target note’s encryption state” — true for update/append, false for create. Users may reasonably expect the derived note to stay encrypted.

**Fix:** when the open note (or any source note) is encrypted, encrypt the new note client-side before `POST /api/notes` (`encryptionVersion: 1`), or warn explicitly that the new note will be plaintext.

---

### M5 — Missing security headers on the live app

**Evidence (live):** HSTS is present (`max-age=63072000; includeSubDomains; preload`, added by Vercel) but all of the following are missing on `/`, `/sign-in` and API responses:

- `Content-Security-Policy` (no `frame-ancestors`, no `script-src`)
- `X-Frame-Options`
- `X-Content-Type-Options: nosniff`
- `Referrer-Policy`
- `Permissions-Policy`
- `X-Powered-By: Next.js` is exposed

**Impact:** the workspace can be framed (clickjacking of “Delete note”, “Encrypt”, sign-out, account switching), and there is no CSP as defense-in-depth if an XSS is ever introduced. No XSS was found today: `react-markdown` has no `rehype-raw`/`dangerouslySetInnerHTML`, and links use `rel="noopener noreferrer"`.

**Fix** (in `next.config.ts` `headers()` or `vercel.json`):

```
Content-Security-Policy: default-src 'self'; frame-ancestors 'none'; object-src 'none'; base-uri 'self'
X-Content-Type-Options: nosniff
Referrer-Policy: strict-origin-when-cross-origin
Permissions-Policy: camera=(), microphone=(self), geolocation=()
X-Frame-Options: DENY
```

Roll out CSP in report-only first (Next injects inline scripts; use a nonce or `'unsafe-inline'` as a short-term step), and set `poweredByHeader: false`.

---

## 5. Low severity / hygiene

| # | Finding | Location | Note |
|---|---|---|---|
| L1 | Unmount keep-alive save can downgrade an encrypted note to plaintext if it races with encryption | `note-editor.tsx:184-200` | Effect captures `note.encryptionVersion` and sends `encryptionVersion: 0` + plaintext. Re-check server state; never send `0` from this path. |
| L2 | `createNoteSchema.refine` is a tautology | `api/notes/route.ts:18-24` | `d.content !== undefined \|\| … \|\| d.content === undefined` is always true. Validation is ineffective for plaintext notes. |
| L3 | Key-bundle fields lack upper bounds; first-insert is check-then-insert | `api/encryption-key/route.ts:9-19,68-84` | `kdfIterations` is any positive int (client CPU freeze on unlock); concurrent POSTs can hit the PK and 500. Add `.max()` + `onConflictDoNothing`. |
| L4 | No MIME validation on transcription; leftover 40 MB `/app-debug.apk`; 87 MB APK in git; dev stack traces expose absolute paths | `api/transcribe/route.ts:36-48`, `public/`, dev `/` | Validate audio MIME, remove artifacts, don’t ship debug builds. |
| L5 | `npm audit`: 21 advisories (9 high, 12 moderate, 0 critical), all in dev/build tooling | `eslint-config-next`, `drizzle-kit`→`esbuild`, `@tailwindcss/typography`→`postcss-selector-parser`, `minimatch`, `picomatch` | Not in the Next runtime bundle. Upgrade dev dependencies; re-run audit in CI. Avoid the audit’s suggested semver-major downgrades. |
| L6 | Signup likely reveals whether an email exists (account enumeration) | Better Auth default | Return a generic message / send a verification email instead of an immediate “user exists” error. |
| L7 | Session revocation can lag up to 5 minutes | `auth.ts:54-57` (`cookieCache.maxAge = 5 * 60`) | Acceptable trade-off; document it. For “sign out all devices”/password change, consider clearing the cache or shortening it. |

**Informational**

- Multi-session UI exposes session tokens to client JS (`note-sidebar.tsx:120-127`) so it can call `setActive`. This is by design, but turns any XSS into total compromise of every account on the device. Revisit with the CSP work.
- Note **titles are stored in plaintext** by design; most notes are plaintext by default. E2EE only protects note bodies the user explicitly encrypts.
- `AI_PROVIDER`/`AI_MODEL` are server-controlled (users cannot choose the model) — good.
- System prompt puts client-supplied note content in `<content>` and instructs the model to treat it as data; a user can only inject into their own context, so prompt injection has no cross-user effect today. This changes if sharing/collaboration is added.

---

## 6. Positive controls verified

- **Auth enforcement:** `GET/POST/PATCH/DELETE` on `/api/notes*`, `/api/encryption-key`, `/api/chat`, `/api/transcribe` → `401` without a session (local build and live).
- **Tenant isolation:** every note query includes `and(eq(notes.id, id), eq(notes.userId, session.user.id))`; chat validates `openNote`/`searchableNotes` IDs against the caller's rows (`chat/route.ts:135-167`).
- **Input handling:** Zod schemas + UUID regex; Drizzle parameterised queries (no string-built SQL).
- **XSS posture:** `react-markdown` without `rehype-raw`; no `dangerouslySetInnerHTML`/`innerHTML`/`eval` in `src`; external links `noopener noreferrer`.
- **Auth hardening:** generic “Invalid email or password”; 3 attempts / 10 s sign-in limiter → `429` (verified live); scrypt password hashing (Better Auth default); `changeEmail` disabled; `/api/auth/list-sessions` requires auth.
- **Secret hygiene:** `.env*` gitignored and `git rev-list --all -- .env.local` = 0 commits; no secret values in `.next/static` (only env **names** in error strings); `BETTER_AUTH_SECRET` is 43 chars; DB URL includes `sslmode=require`.
- **E2EE crypto:** AES-256-GCM with random 96-bit IVs; 256-bit random recovery key; separate IVs for DEK wrap, recovery wrap and verifier; server never receives plaintext for encrypted notes (except the AI flows above).
- **Deployment:** HSTS present; `/api/*` not publicly cacheable in the current build.
- **Build:** typecheck passes; production build succeeds; lint 0 errors (24 warnings).

---

## 7. Prioritised remediation plan

1. **H2 (hours):** delete `/lumen.apk` and `/app-debug.apk` from `public/` and the live site; build a release-signed, non-debuggable APK; set `allowBackup="false"`.
2. **H1 (hours):** set `requireLocalEmailVerified: true`; enable email verification; consider disabling implicit linking.
3. **H3 (days):** email verification/CAPTCHA + per-user AI quotas and rate limits; cap total chat context and attachments server-side.
4. **M1 (hours):** redeploy, confirm `private, no-store` on auth pages, add `Vary: Cookie`/`CDN-Cache-Control: private`, fix the `Suspense` warning.
5. **M2/M4 (days):** consent + encryption policy for `searchableNotes` and AI-created notes.
6. **M3 (days):** verify setup password, handle password change (re-wrap or block+warn), verified key rotation, Argon2id.
7. **M5 (hours):** security headers + `poweredByHeader: false`.
8. **L1–L7:** schedule with normal maintenance; add `npm audit`/Dependabot and (optionally) ZAP/Burp baseline scans in CI.

---

## 8. Test log (key observations)

```
# Live, anonymous
GET  /                     -> 200, cache-control: public, x-vercel-cache: HIT, age ~47h,
                              body redirects to /sign-in
GET  /api/notes            -> 401
POST /api/chat             -> 401
POST /api/transcribe       -> 401
POST /api/encryption-key   -> 401
POST /api/auth/sign-in/email (bad creds) x3 -> 401 "Invalid email or password"
POST /api/auth/sign-in/email (4th)          -> 429 "Too many requests"
GET  /api/auth/get-session -> 200 null
GET  /api/auth/list-sessions -> 401
POST /api/auth/change-password (no body)    -> 400 validation  (endpoint enabled)
POST /api/auth/delete-user (no session)     -> 401             (endpoint enabled)
HEAD /lumen.apk            -> 200, 87,633,894 bytes
HEAD /app-debug.apk        -> 200, 40,174,596 bytes

# APK
apksigner verify --print-certs public/lumen.apk
  Signer #1: C=US, O=Android, CN=Android Debug
aapt2 dump badging public/lumen.apk
  application-debuggable
  android:allowBackup="true"

# Local production build
npm run lint       -> 0 errors, 24 warnings
npm run typecheck  -> pass
npm run build      -> pass (10 pages; /, /sign-in, /sign-up = Partial Prerender)
GET  /             -> 200, cache-control: private, no-cache, no-store,
                      body: NEXT_REDIRECT;replace;/sign-in;307
```

---

## 9. Caveats

- This is a point-in-time, non-destructive assessment, not a guarantee. Authenticated business-logic abuse, race conditions under load, and provider-side issues were not exhaustively tested.
- Severity assumes the live deployment and the `main` branch are the same code. The live cache headers suggest the deployed build may be older; redeploy before re-testing.
- No production data was modified. The only state-changing requests were five failed sign-in attempts (four rejected by the rate limiter) against a non-existent address.
