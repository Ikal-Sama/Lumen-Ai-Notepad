# Lumen — AI note-taking workspace

A calm, three-panel notebook built with the Next.js App Router. Write Markdown, ask an AI assistant questions, and tell it to save, rewrite, or extend notes straight into your account.

![Stack](https://img.shields.io/badge/Next.js-16-000) ![TypeScript](https://img.shields.io/badge/TypeScript-5-3178c6) ![Tailwind](https://img.shields.io/badge/Tailwind-4-38bdf8)

## Features

- **Email/password auth** with Better Auth + the Drizzle adapter, plus optional Google OAuth
- **Private notes** scoped to the signed-in user, with cascade deletes
- **Opt-in per-note encryption (E2EE)** — encrypt individual notes in the browser (ciphertext stored in DB, titles remain plaintext). One-time recovery key at setup; one-way once enabled; unlock prompted on demand for encrypted notes.
- **Three-panel workspace** — notes sidebar, Markdown editor, collapsible AI chat
- **Markdown editing** with auto-save, manual save (`Ctrl/Cmd + S`), undo (`Ctrl/Cmd + Z`), preview, and formatting toolbar
- **AI tool calling** - create notes (`createNote`), read, rewrite, or append to the open note (`updateNote`, `appendToNote`), and search across notes available in the current session (`searchNotes`)
- **AI voice & attachments** - dictate prompts with the mic (browser speech recognition where supported) and attach images/files to chat messages for multimodal-capable models
- **AI quick actions** - Improve, Summarize, and Continue buttons send the open note to the assistant after flushing unsaved edits (with an in-app warning for encrypted notes, once per encrypted note per session)
- **Real-time sync** — when the AI creates or edits a note, the sidebar and editor refresh automatically
- **Responsive** — the sidebar and AI panel become overlays on small screens

## Tech stack

| Layer    | Technology                              |
| -------- | --------------------------------------- |
| Frontend | Next.js 16 (App Router), React 19       |
| Styling  | Tailwind CSS 4, Lucide icons            |
| Database | Supabase PostgreSQL, Drizzle ORM        |
| Auth     | Better Auth (email + password)          |
| AI       | Vercel AI SDK 7, OpenAI or Google       |
| Markdown | react-markdown + remark-gfm             |

## Getting started

### 1. Install dependencies

```bash
npm install
```

### 2. Create a Supabase project

1. Create a project at [supabase.com](https://supabase.com).
2. Open **Connect** (top bar) → **Connection string**.
3. Copy the **Session pooler** URI (port `5432`). It looks like
   `postgresql://postgres.<ref>:<password>@aws-0-<region>.pooler.supabase.com:5432/postgres`.
   - Supabase's direct connection (`db.<ref>.supabase.co`) is IPv6-only on newer
     projects. If you see `ENOTFOUND` or cannot connect, that is why — use the
     pooler string instead.
   - Add `?sslmode=require` if the copied string does not include it.
4. For serverless deployments you can switch to the **Transaction pooler**
   (port `6543`); the app already sets `prepare: false` for it.

### 3. Configure environment variables

```bash
cp .env.example .env.local
```

On Windows PowerShell:

```powershell
Copy-Item .env.example .env.local
```

Fill in:

```env
DATABASE_URL="postgresql://..."
BETTER_AUTH_SECRET="..."          # npx auth@latest secret
BETTER_AUTH_URL="http://localhost:3000"
NEXT_PUBLIC_APP_URL="http://localhost:3000"

AI_PROVIDER="openai"              # or "google"
OPENAI_API_KEY="sk-..."
# GOOGLE_GENERATIVE_AI_API_KEY="..."
# AI_MODEL="gpt-4o-mini"          # optional override

# Optional Google OAuth:
# GOOGLE_CLIENT_ID="..."
# GOOGLE_CLIENT_SECRET="..."
```

### Google OAuth (optional)

#### Web (browser redirect flow)
1. In [Google Cloud Console](https://console.cloud.google.com/apis/credentials),
   create an OAuth 2.0 Client ID (**Web application**).
2. Add authorized redirect URIs:
   - `http://localhost:3000/api/auth/callback/google`
   - `https://<your-production-domain>/api/auth/callback/google`
3. Put the web client ID and secret in `.env.local` (or Vercel env vars):
   ```env
   GOOGLE_CLIENT_ID="..."        # or GOOGLE_WEB_CLIENT_ID
   GOOGLE_CLIENT_SECRET="..."    # or GOOGLE_WEB_CLIENT_SECRET
   ```
4. Restart the dev server. "Continue with Google" uses the redirect flow on the web.

#### Native Android app (no browser redirect)
The installed Capacitor app uses native Google Sign-In (`@capgo/capacitor-social-login`) to get an ID token, then signs in with Better Auth (`signIn.social` + `idToken`).

1. Create an **Android** OAuth client in Google Cloud for package `com.lumen.notes` with your app signing certificate **SHA-1** (debug/release as applicable).
2. Ensure a **Web** OAuth client exists (used by the plugin/server to issue/verify ID tokens for backend auth).
3. Configure env vars:
   ```env
   # Server (Better Auth) - accepts native ID token audiences too
   GOOGLE_CLIENT_ID="..."              # web client ID (or GOOGLE_WEB_CLIENT_ID)
   GOOGLE_CLIENT_SECRET="..."          # web client secret (or GOOGLE_WEB_CLIENT_SECRET)
   GOOGLE_ANDROID_CLIENT_ID="..."      # Android OAuth client ID (optional but recommended)

   # Client (Capacitor plugin, public)
   NEXT_PUBLIC_GOOGLE_WEB_CLIENT_ID="..."  # same web client ID
   ```
4. Run `npx cap sync android`, rebuild/reinstall the APK, and deploy the web app with the public env var set.
5. If sign-in fails, verify package name, SHA-1, OAuth client IDs, and that the ID token audience is accepted by the server.


Push the schema directly (fastest for development):

```bash
npm run db:push
```

Or apply the SQL migrations (a baseline migration is already committed in
`drizzle/`):

```bash
npm run db:migrate
```

If you change `src/db/schema.ts`, generate a new migration first:

```bash
npm run db:generate
```

> `drizzle-kit migrate` runs DDL against your database. If your app uses the
> transaction pooler, you may need to use the direct connection string
> (port `5432`) for migrations, then switch the app back to the pooler.

### 5. Run the app

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000), create an account, and try:

> “Create a 7-day plan for launching my side project and save it as a note.”

## Project structure

```
drizzle.config.ts                 Drizzle Kit config (Supabase PostgreSQL)
src/
  app/
    (auth)/
      layout.tsx                  Split-screen auth layout
      sign-in/page.tsx            Sign-in page (redirects if authenticated)
      sign-up/page.tsx            Sign-up page
    api/
      auth/[...all]/route.ts      Better Auth catch-all handler
      chat/route.ts               Authenticated AI chat + note tools
      notes/route.ts              List + create notes
      notes/[id]/route.ts         Read + update + delete a note
    globals.css                   Tailwind theme + editorial styles
    layout.tsx                    Root layout and fonts
    page.tsx                       Protected workspace (server component)
  components/
    auth/auth-form.tsx            Shared sign-in / sign-up form
    workspace/
      workspace.tsx               App shell and client-side state
      note-sidebar.tsx            Notes list, search, profile, logout
      note-editor.tsx             Markdown editor with auto-save, preview, AI actions
      ai-chat-panel.tsx           Streaming chat with tool result cards
      confirm-dialog.tsx          Delete confirmation
    brand.tsx                     Wordmark
    markdown.tsx                  Markdown renderer
  db/
    index.ts                      postgres.js + Drizzle client
    schema.ts                     Better Auth tables + notes table
  lib/
    auth.ts                       Better Auth server config
    auth-client.ts                Better Auth React client
    session.ts                    Server-side session helper
    notes.ts                      Note serialization + UUID validation
    types.ts                      Shared Note + typed UIMessage shapes
    utils.ts                      Formatting helpers
  app/api/...                     Route handlers
```

## How the AI works

1. The client sends `{ messages, noteId }` to `POST /api/chat`, where `noteId` is
   the note currently open in the editor.
2. The route calls `auth.api.getSession({ headers: await headers() })`. Requests
   without a session get **401 Unauthorized** before any model call.
3. The route verifies that `noteId` belongs to the signed-in user, then includes
   the note's title and Markdown in the model instructions (truncated at 50k
   characters for very long notes).
4. `streamText` is configured with three tools:
   - `createNote` — insert a new note.
   - `updateNote` — replace the open note's title and/or full Markdown content.
   - `appendToNote` — append Markdown to the end of the open note.
   - `searchNotes` — keyword search across the user's notes (read-only), returning excerpts and content.
5. Tool executions always scope the update with both the note ID and
   `session.user.id`. Tool inputs cannot choose an arbitrary note.
6. Before sending a chat message, the editor flushes any debounced saves. After
   the stream finishes, the client inspects tool parts in `onFinish`:
   - `createNote` → refetch the list and select the new note.
   - `updateNote` / `appendToNote` → refetch the note and refresh the open editor.
7. The editor's **Improve**, **Summarize**, and **Continue** buttons reuse the
   same chat pipeline by pre-filling a prompt and sending the open note as
   context.

`stopWhen: isStepCount(4)` allows the model to run a tool and then produce a
short confirmation in the same stream.

> Edits are last-write-wins: pending local saves are flushed before each AI
> request, but typing while the model is responding can be replaced by the
> tool result.

## Database schema

**Better Auth tables** — `user`, `session`, `account`, `verification`

- IDs are `text` (Better Auth generates them)
- `session.userId`, `account.userId` → `user.id` with `onDelete: cascade`
- `session.token` and `user.email` are unique

**Notes** — `notes`

- `id`: `uuid` primary key (`defaultRandom()`)
- `userId`: `text` foreign key → `user.id` (`onDelete: cascade`)
- `title`: `text`, not null
- `content`: `text`, not null, Markdown
- `createdAt` / `updatedAt`: `timestamptz`, default `now()`

## Scripts

| Command              | Purpose                          |
| -------------------- | -------------------------------- |
| `npm run dev`        | Start the dev server             |
| `npm run build`      | Production build                 |
| `npm run start`      | Start the production server      |
| `npm run lint`       | ESLint                           |
| `npm run typecheck`  | TypeScript without emitting      |
| `npm run db:generate`| Generate Drizzle SQL migrations  |
| `npm run db:migrate` | Apply Drizzle migrations         |
| `npm run db:push`    | Push schema directly (dev)       |
| `npm run db:studio`  | Open Drizzle Studio              |

## Deploying to Vercel

1. Add every variable from `.env.example` to your Vercel project.
2. Set `BETTER_AUTH_URL` and `NEXT_PUBLIC_APP_URL` to your production URL.
3. Use the Supabase **transaction pooler** URL for `DATABASE_URL`.
4. Run migrations against the database before or during your first deploy.

## Android / Capacitor Development

To run the app on Android via Capacitor:
1. Start the Next.js dev server on your computer:
   ```bash
   npm run dev
   ```
2. The Capacitor configuration (`capacitor.config.ts`) points the mobile WebView to `http://10.0.2.2:3000` (the Android emulator's alias for localhost).
3. Run or deploy the Android app from Android Studio.


## Security notes

- **Opt-in per-note E2EE:** you choose which notes to encrypt. Encrypted note bodies are encrypted client-side (Web Crypto, AES-GCM; key wrapped via password-derived KEK) before API/DB storage, so database contents do not reveal their text. **Titles are stored in plaintext** for sidebar/navigation. Plaintext notes remain usable without unlocking encryption.
- **Unlock & recovery:** unlocking is required to view/edit encrypted notes (prompted on demand). A one-time recovery key is generated at encryption setup and must be saved by the user. Losing both password and recovery key means encrypted note content cannot be recovered. Encryption is one-way once enabled for a note.
- **AI and privacy:** when using AI on an **encrypted** note, the app shows an in-app warning (once per encrypted note per session) because decrypted content is sent to the AI service for that request. AI-assisted mutations preserve the target note’s encryption state (encrypted notes stay encrypted).
- **Access control:** every notes/key API handler resolves the session server-side and scopes queries with `session.user.id`; users cannot read or mutate another user's notes or key material.
- The chat route is authenticated before the model is called.
- Note content is rendered with `react-markdown` (no `dangerouslySetInnerHTML`).
- **Database migration:** apply the included Drizzle migration (`drizzle/0001_e2ee_notes.sql`) before using encrypted notes in an existing database. Notes encrypted by earlier app versions remain encrypted.
- **Security assessments:** see [`docs/security-and-bug-review.md`](docs/security-and-bug-review.md) (source review) and [`docs/security-assessment-2026-11-18.md`](docs/security-assessment-2026-11-18.md) (penetration-style assessment with prioritized fixes).
- **UX & maintainability:** see [`docs/ux-maintainability-pass.md`](docs/ux-maintainability-pass.md) for the latest resilience, accessibility, and code-health changes.
