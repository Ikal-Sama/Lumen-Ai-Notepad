# Undo + Note Encryption Plan

## Current state (merged baseline)
- Editor undo: Undo button + `Ctrl/Cmd+Z`, coalesced/bounded history, clears on AI `revision`/note switch.
- E2EE foundation: `user_encryption_key` + encrypted note fields/migration, client crypto (AES-GCM, PBKDF2 KEK, wrapped DEK, one-time recovery key), key API, decrypt/encrypt flows, chat adapted to client-decrypted context with encrypted persistence for AI mutations.
- **Current behavior to change:** encryption is effectively global/workspace-wide (unlock/setup gates workspace, new notes encrypted, legacy notes auto-migrated on unlock), AI sensitive-data warning is a `window.confirm` shown once per session for AI use.

## New confirmed decisions (per-note opt-in refactor)
- **Encryption scope:** opt-in **per note** (user selects which note to encrypt). Plaintext notes remain accessible without encryption unlock. New notes are plaintext by default unless encrypted explicitly.
- **One-way:** once a note is encrypted, it **cannot** be converted back to plaintext.
- **Key management:** keep per-user key material + one-time recovery key. Setup occurs on first encrypt action if needed; unlock is prompted when accessing/using an encrypted note while locked (not a global workspace gate).
- **Existing encrypted notes:** keep them encrypted as opt-in encrypted notes.
- **AI warning:** replace native `window.confirm` with an in-app **AlertDialog** UI. Show warning **only** when the AI action uses/sends content of an **encrypted** note, **once per note per session**. No warning for plaintext notes.
- **AI results:** if the target/open note is encrypted, AI-created/updated content is saved **encrypted**.

## Solution (refactor)
1. **AlertDialog + warning logic:** generalize/extend dialog component for warning tone; track acknowledged encrypted note IDs per session; gate AI send/retry/quick actions on encrypted-note warning only.
2. **Per-note encryption UX/data flow:** add "Encrypt note" action and encrypted/locked indicators; encrypt selected note on demand (setup/unlock prompts as needed), persist per-note `encryptionVersion/ciphertext/iv`; stop auto-encrypting all notes and stop global unlock gate/auto-migration.
3. **Reads/writes:** decrypt only encrypted notes when key is available; allow plaintext notes to function without DEK. Save plaintext vs encrypted payload based on note state (encrypted stays encrypted).
4. **AI integration:** include/provide decrypted content only for accessible notes as appropriate; require unlock before AI on a locked encrypted note; persist mutations according to target note encryption state.

## Files expected to change
- `src/components/workspace/confirm-dialog.tsx` (or new alert dialog) and `src/components/workspace/ai-chat-panel.tsx`
- `src/components/workspace/workspace.tsx`, `src/components/workspace/note-editor.tsx`, `src/components/workspace/note-sidebar.tsx`
- `src/lib/e2ee/context.tsx`, `src/lib/notes.ts`, `src/lib/types.ts`, `src/app/page.tsx`
- `src/app/api/notes/route.ts`, `src/app/api/notes/[id]/route.ts`, `src/app/api/chat/route.ts` (as needed)
- `README.md`, this plan

## Testing approach
- Manual: encrypt a specific note (setup+recovery first time), unlock prompt for encrypted note on reload, plaintext notes unaffected, one-way encryption, save/create/edit/delete for both, undo, AI warning AlertDialog only for encrypted notes once per note per session, AI results saved encrypted for encrypted targets, existing encrypted notes remain encrypted.
- Quality gate: `npm run lint`, `npm run typecheck`, `npm run build`.
