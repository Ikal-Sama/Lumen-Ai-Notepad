# Security and Bug Review

**Date:** 2026-11-16  
**Scope:** Next.js app (App Router), API routes, auth, note/E2EE flows, AI chat/transcription, editor/preview rendering.  
**Method:** Static code review of repository sources (no dynamic penetration testing, no dependency audit beyond what is visible in the repo).

## Summary

| Severity | Finding |
|---|---|
| High | Encryption key bundle can be replaced by any authenticated session without verification (risk of permanent encrypted-note data loss/corruption) |
| Medium | Chat API trusts client-supplied note content/IDs without server-side ownership verification |
| Medium | Note PATCH accepts encrypted updates without requiring ciphertext/IV, allowing corrupted encrypted notes |
| Medium | Internal/provider error messages are returned to clients in transcription (and potentially other paths) |
| Low | Limited request-size/cost controls for chat payloads; client-supplied searchable context can be abused for cost/DoS |
| Informational | Markdown rendering is reasonably hardened against raw-HTML XSS in current configuration |

---

## Findings

### 1. [High] Encryption key bundle is replaceable without verification

**Location**
- `src/app/api/encryption-key/route.ts` (`POST`, lines 52-84)
- Schema: `bundleSchema` requires bundle fields but no proof-of-possession/current-key verification.

**Evidence**
- The endpoint authenticates the user (`getSession`) and then inserts or **overwrites** the existing `user_encryption_key` row:
  - Existing row: `db.update(userEncryptionKeys).set(parsed.data).where(eq(userEncryptionKeys.userId, session.user.id))`
  - No existing row: `db.insert(userEncryptionKeys).values(values)`
- No check ensures the requester can decrypt/unwrap the existing DEK, no confirmation step, and no guard against replacing a bundle that existing encrypted notes depend on.

**Impact**
- An attacker with a valid session (stolen cookie/token, compromised device session, XSS-driven authenticated action if introduced later, etc.) can replace the key-wrapping material.
- Replacing the bundle can make previously encrypted notes **unrecoverable/unreadable** for the legitimate user (availability/integrity loss of E2EE content), even if ciphertext remains in the database.
- Accidental client bugs could also rotate keys destructively because the server accepts blind replacement.

**Recommendations**
- Treat key-bundle replacement as a sensitive operation: require proof of current key ownership (e.g. client proves ability to unwrap/decrypt verifier with current credentials) or a dedicated, explicit key-rotation flow that re-wraps/re-encrypts as needed.
- At minimum, reject `POST` when a bundle already exists unless an explicit, verified rotation flow is used; log/audit rotation attempts.
- Consider rate limiting and additional CSRF/session-hardening for this endpoint.

---

### 2. [Medium] Chat API trusts client-supplied note content and note identifiers

**Location**
- `src/app/api/chat/route.ts` (`POST`, lines 100-243)
  - Payload parsing: lines 106-140
  - Tool behavior: `createNote` (147-160), `searchNotes` (161-195), `updateNote` (196-215), `appendToNote` (216-234)

**Evidence**
- The route only checks authentication; it does **not** load or authorize notes server-side.
- `openNote` is taken directly from request body and used as trusted context and as the target for mutations:
  - `id`, `title`, `content` copied from `payload.openNote` (122-129)
  - `updateNote`/`appendToNote` return `openNote.id` and derive results from `openNote` (200-233)
- `searchableNotes` is taken entirely from client input and used as the search corpus (131-140, 170-194).
- `noteId` in the body is accepted as `unknown` but not validated/used.

**Impact**
- A malicious authenticated client can inject arbitrary content into the model context (prompt/context manipulation beyond intended note content), spoof note titles/IDs in tool outputs, or supply arbitrary "searchable" data as if it were the user’s notes.
- Because persistence for AI mutations is applied client-side in this architecture, untrusted IDs/content can drive confusing or unintended client behavior and weaken server-side trust boundaries.
- Enables abuse patterns (e.g. oversized/irrelevant context) that increase token usage/cost.

**Recommendations**
- Resolve the active note and searchable notes **server-side** by authenticated `userId` (or validate client-provided IDs against DB ownership before use).
- Treat client-provided note bodies as untrusted hints at most; never trust client-supplied IDs for mutation targets without authorization.
- Validate and cap sizes/counts for `messages`, `openNote.content`, and `searchableNotes`.

---

### 3. [Medium] PATCH can store encrypted notes without ciphertext/IV (data corruption)

**Location**
- `src/app/api/notes/[id]/route.ts` (`PATCH`, lines 56-115)
- Compare with stricter create validation: `src/app/api/notes/route.ts` (`POST`, lines 10-24, 57-70)

**Evidence**
- `updateNoteSchema` only requires that *some* field is present (14-30); it does not require `contentCiphertext` and `contentIv` when `encryptionVersion > 0`.
- When `encryptionVersion > 0`, the handler sets:
  - `updates.content = ""`
  - `updates.contentCiphertext = parsed.data.contentCiphertext ?? null`
  - `updates.contentIv = parsed.data.contentIv ?? null` (90-95)
- This allows an encrypted note update with missing ciphertext/IV, producing a note marked encrypted but lacking decryptable data.

**Impact**
- Clients or integrations can accidentally (or maliciously, within an authenticated session) corrupt encrypted notes so content cannot be decrypted/recovered through normal flows.
- Integrity/availability issue for encrypted note data.

**Recommendations**
- Mirror create-time invariants in PATCH: if `encryptionVersion > 0`, require non-empty `contentCiphertext` and `contentIv`; reject invalid combinations.
- Consider rejecting transitions that would downgrade/alter encryption state unless explicitly intended and validated.

---

### 4. [Medium] Internal/provider error details returned to clients

**Location**
- `src/app/api/transcribe/route.ts` (lines 50-62)
  - Catch returns `error.message` directly: `{ error: message }` with status 500.

**Evidence**
- `catch (error) { const message = error instanceof Error ? error.message : "Failed to transcribe audio."; return NextResponse.json({ error: message }, { status: 500 }); }`

**Impact**
- Provider/library/internal error messages may leak configuration details, model/service identifiers, quotas, or upstream behavior to end users.
- Information disclosure can aid targeted abuse or confuse users with non-actionable internals.

**Recommendations**
- Return a generic client-facing error message; log detailed errors server-side with request/session correlation (without logging sensitive audio/content).
- Map known safe/provider-safe cases to user-friendly messages; avoid forwarding raw exception text by default.

---

### 5. [Low] Limited payload/cost controls for chat requests

**Location**
- `src/app/api/chat/route.ts` (lines 106-145, 167-194)
- `src/app/api/transcribe/route.ts` enforces a 20MB audio limit (line 46), which is good.

**Evidence**
- Chat route parses JSON and accepts `messages`, `openNote`, and `searchableNotes` from the client without explicit max byte/element limits.
- `searchableNotes` is filtered/mapped but not capped in count or total size before processing/prompt construction.
- `openNote.content` and each searchable note `content` are coerced to strings from client input; truncation is applied in some prompt/result paths but large inputs can still consume server resources and model tokens.

**Impact**
- Authenticated abuse can increase latency, memory usage, and AI/token costs (cost-amplification/DoS pressure), especially in serverless environments.

**Recommendations**
- Enforce strict limits: max request body size, max `messages` count, max total/individual note content lengths, max `searchableNotes` count.
- Consider per-user rate limiting for chat/transcription endpoints.

---

### 6. [Informational] Markdown rendering posture

**Location**
- `src/components/markdown.tsx`

**Evidence**
- Uses `react-markdown` with `remark-gfm` and `remark-breaks` and custom component overrides for links and task checkboxes.
- No `rehype-raw`/HTML pass-through plugins observed; links are rendered with `target="_blank"` and `rel="noopener noreferrer"`.

**Impact**
- Current configuration reduces risk of raw-HTML/script injection via note markdown compared to unsanitized HTML rendering.
- This is not a full security guarantee (future plugin/component changes or CSS-based abuse could alter posture).

**Recommendations**
- Keep raw HTML disabled unless explicitly required; if ever enabled, add strict sanitization.
- Continue validating/sanitizing URL schemes if link handling becomes more permissive.

---

## Positive Controls Observed

- Notes and encryption-key API routes require an authenticated session and scope note operations by `session.user.id` (prevents basic cross-user IDOR in those routes).
- Note IDs are UUID-validated in `[id]` routes before DB access.
- Zod validation and payload size caps exist for note content fields and transcription uploads.
- E2EE design stores note ciphertext/IV per note and key-wrapping material per user; server does not need plaintext for encrypted note storage paths.

## Suggested Next Steps

1. **Prioritize** fixing key-bundle replacement semantics and tightening PATCH invariants for encrypted notes.
2. **Harden chat** by resolving/authorizing note context server-side and capping payload sizes.
3. **Sanitize error responses** and add structured server-side logging/rate limiting.
4. Perform a dependency vulnerability audit (`npm audit` / SCA) and add automated security checks in CI.

## Notes

- This document records issues identified from source review; exploitability in production also depends on deployment configuration, Better Auth settings, rate limiting/WAF controls, and client behavior.
