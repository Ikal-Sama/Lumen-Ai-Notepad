# UX & Maintainability Pass — 2026-11-20

Branch: `feat/ux-maintainability-polish`

Goal: smoother navigation and recovery, better accessibility, less repeated validation code — without restructuring the large workspace components (deferred).

## Changes

### Resilience

- **`src/app/error.tsx`** — friendly error boundary with a retry action. Previously a DB/AI failure showed Next's default error screen.
- **`/sign-in` and `/sign-up`** — set `export const instant = false`. Both pages await `searchParams` and the session before rendering, so they are allowed to block; this removes the instant-navigation validation warning and the streamed-redirect shell.

### Correctness / maintenance

- **`src/lib/note-schemas.ts`** — single source for the note create/update Zod schemas used by `POST /api/notes` and `PATCH /api/notes/[id]`.
  - Fixes the previous create validation that always passed (`... || d.content === undefined`).
  - `POST` now rejects a payload with neither title nor content.
  - Encrypted updates still require both `contentCiphertext` and `contentIv`.
- **AI payload cap** — `searchableNotes` sends at most 20,000 characters per note to `/api/chat` instead of the full body. The chat tool results were already capped at 2,000 characters; `openNote` still returns full content for the selected note.

### Accessibility / smoothness

- `ConfirmDialog`: initial focus on Cancel, focus restored on close, Tab focus trap inside the dialog, and `aria-describedby` for the description.
- Icon-only toolbar buttons in the note editor gained `aria-label`s (`Encrypt`, `Preview/Edit`, `Save`).
- AI chat: auto-scroll now only follows new messages when the user is near the bottom; a "Latest" button jumps back down.
- Global `prefers-reduced-motion` rule disables animations/transitions for users who ask for it.

### Tooling

- `eslint.config.mjs` ignores generated/third-party folders (`.opencode/**`, `graphify-out/**`, `android/**/build/**`) and ignores `_`-prefixed unused bindings.
- Local logos use `next/image`; remote OAuth avatars and runtime attachment URLs keep `<img>` with a documented lint exception (their hosts vary).
- `npm run lint`, `npm run typecheck`, and `npm run build` pass with no warnings.

## Deferred (next pass)

- Split `ai-chat-panel.tsx` (~1,230 lines), `workspace.tsx` (~800), and `note-editor.tsx` (~740) into hooks + presentational components.
- Server-side search for plaintext notes so the full corpus no longer travels with each chat request.
