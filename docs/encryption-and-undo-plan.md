# Undo + Note E2EE Plan

## Decisions (confirmed)
- **Undo:** Undo button only (no Redo). `Ctrl/Cmd+Z` supported. History is coalesced, bounded, and cleared on note switch and on AI-driven note refresh (`revision`). Undo marks the note dirty and participates in existing autosave/flush.
- **Encryption:** True client-side E2EE (zero-knowledge) for note **content**. Note **titles remain plaintext**. Server/DB stores ciphertext + crypto metadata only; keys are held client-side.
- **Recovery:** One-time **Recovery Key** generated at encryption setup and shown once for the user to save. Recovery path can restore/unlock wrapped data key without the original password (implementation detail documented with key-wrapping scheme).
- **AI:** Show a sensitive-data confirmation warning **once per session** before the first AI action that uses/sends note content (chat send, retry/regenerate, quick actions). Warning states decrypted content may be sent to the AI service for that request. User must confirm to proceed.
- **Migration:** Existing plaintext notes are migrated to encrypted form on first successful unlock for a user.
- **Branch:** Single branch `feature/undo-and-note-e2ee`.

## Problems
1. Editor lacks explicit undo/history resilient to programmatic edits and autosave flows.
2. Notes (`title` plaintext, `content` currently plaintext in DB/APIs/AI tools) are readable by anyone with DB/server access; requirement is confidentiality even from developers/admins with DB access.

## Solution overview

### Phase 1 — Editor Undo
- Add coalesced in-memory undo stack of `{title, content}` snapshots in `src/components/workspace/note-editor.tsx`.
- Add Undo toolbar button (disabled when unavailable) and keyboard shortcut.
- Keep refs/state/save status consistent; clear history on note change/remount and `revision` updates.

### Phase 2 — E2EE model
- Client-side crypto (Web Crypto): per-user DEK (AES-GCM) for note content; KEK derived from password (KDF with per-user salt/params) wraps DEK. Store wrapped key material + verifier + params server-side, scoped to user. Recovery Key provides an alternate unwrap path.
- DB/schema: key-material table and encrypted content fields/metadata for notes; titles remain plaintext.
- APIs/page load transport ciphertext for content; server never decrypts.

### Phase 3 — Unlock & migration
- Capture password at sign-in/sign-up/setup to establish/unlock keys; prompt unlock on session restore (keys kept in memory).
- Encrypt on create/save/flush; decrypt on load after unlock.
- Migrate legacy plaintext note content to encrypted on first unlock.

### Phase 4 — AI integration
- Once-per-session sensitive-data confirmation before AI actions that use note content.
- Adapt chat/editor/workspace so AI operates on client-decrypted context/results are re-encrypted before persistence. Server-side plaintext `searchNotes` over content must be reworked (client-side over decrypted notes) or limited; document behavior.

## Files expected to change
- Editor/UI: `src/components/workspace/note-editor.tsx`, `src/components/workspace/workspace.tsx`, `src/components/workspace/ai-chat-panel.tsx`, possibly sidebar/auth UI for unlock/recovery flows.
- Crypto/lib: new `src/lib/crypto/*` or `src/lib/e2ee/*`, `src/lib/notes.ts`, `src/lib/types.ts`, auth/session touchpoints as needed.
- Data/API: `src/db/schema.ts`, `drizzle/*` migrations, `src/app/api/notes/route.ts`, `src/app/api/notes/[id]/route.ts`, `src/app/api/chat/route.ts`, `src/app/page.tsx`.
- Docs: `README.md`, this plan.

## Implementation status (this branch)
- **Done:** Undo (toolbar + `Ctrl/Cmd+Z`, coalesced history, clears on AI revision), once-per-session AI sensitive-data confirmation, E2EE schema/migration (`user_encryption_key`, encrypted note fields), client crypto primitives + recovery key, key storage API, workspace unlock/setup/recovery UI, encrypted note create/save/fetch/decrypt flow, legacy plaintext migration on unlock, chat flow adapted to client-provided decrypted context with client-side encrypted persistence for AI mutations.
- **Notes/limits:** unlock/setup currently prompts for the account password in the workspace (required on reload/new setup); OAuth-only accounts without a usable password need a dedicated passphrase flow to be fully supported. Server-side `searchNotes` over DB content is replaced by client-provided decrypted-session search context.
- **Testing approach:** manual undo/E2EE setup-unlock-recovery/CRUD/migration/AI flows + DB ciphertext verification. Quality gate before merge: `npm run lint`, `npm run typecheck`, `npm run build`.
