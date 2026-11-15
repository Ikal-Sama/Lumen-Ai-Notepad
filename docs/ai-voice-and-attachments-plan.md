# AI Voice & Attachments Plan

## Goal
Add voice dictation and file attachments to the AI chat composer.

## Scope
- **Voice (dictation):** Mic button in composer toggles browser speech recognition (`SpeechRecognition`/`webkitSpeechRecognition`) when available; transcribed text appends to input. Graceful fallback/disabled state when unsupported.
- **Attachments:** Attach button to pick files (images and common document types). Selected files shown as removable chips above composer and sent with the message as file parts so multimodal-capable models can process them. User message bubbles render attached files/images.
- **API:** Keep `/api/chat` compatible by passing through UI message parts (`convertToModelMessages` already handles message content); no server-side file storage.
- **Constraints:** Reuse existing send/consent flow (encrypted-note warning applies). Keep changes focused to chat UI/API.

## Files
- `src/components/workspace/ai-chat-panel.tsx` (composer, mic/attach UI, file state, message rendering)
- `src/app/api/chat/route.ts` (only if payload/limits need adjustment)
- `README.md` (note voice/attachment capability)
