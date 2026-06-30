## Convert Email to Note

Add an AI-powered "Convert to Note" action on linked email cards that drafts a structured consultation note for the user to review, edit, and save against the client.

### 1. Edge function — `supabase/functions/generate-email-note/index.ts`

- New function modeled on `extract-note-title` (CORS headers, JWT-required, Lovable AI gateway, `google/gemini-3-flash-preview`).
- Verify the caller JWT (same pattern as `capture-outlook-email`); reject anonymous.
- Body: `{ email_id: string }`.
- Use service-role client to fetch the row from `email_messages` (`subject`, `sender_name`, `sender_email`, `received_at`, `body_html`, `body_preview`). 404 if not found.
- Build the prompt using `body_html` (stripped to text server-side) or fall back to `body_preview`. Truncate to ~8000 chars.
- Use AI tool-calling to return structured `{ title, note_content }`:
  - `title`: ≤ 8 words, sentence case, subject-derived.
  - `note_content`: plain text, first-person consultant tone, sections for summary / key points / action items / outcomes — exactly as specified in the prompt.
- Return `{ title, note_content }` on success; `{ error }` with status 500 on AI failure. Handle 429/402 gracefully with a clear message.

### 2. New component — `src/components/email/ConvertEmailToNoteDialog.tsx`

- Props: `{ open, onOpenChange, email: LinkedEmail, tenantId: number, onSuccess? }`.
- On open, invoke `generate-email-note` with `{ email_id: email.id }`. Show 3 skeleton lines while loading.
- On success: prefill editable Title input + Note textarea (min 6 rows).
- On error: inline error message, leave textarea empty for manual entry.
- Fields:
  - Title (Input)
  - Note content (Textarea)
  - Note type (Select, default `email`; options General/Email/Follow-up/Meeting/Phone Call/Action → `general`, `email`, `follow-up`, `phone-call`, `meeting`, `action`)
  - Priority (Select, default `normal`; Normal/High/Urgent)
- Use `useNotes({ parentType: 'tenant', parentId: tenantId, tenantId })`.
- Save calls `createNote({ title, note_details, note_type, priority, parent_type_override: 'tenant', parent_id_override: tenantId })`. Toast "Note created", `onSuccess()`, close.
- Reset all state on close so reopening is fresh.

### 3. `src/components/email/LinkedEmailsList.tsx`

- Add `convertNoteEmail` state.
- Add a ghost `FileText` icon button in the existing actions area of each email card (next to the Eye button), `e.stopPropagation()` + `setConvertNoteEmail(email)`.
- Render `<ConvertEmailToNoteDialog>` once at the bottom, wired to `clientId` as `tenantId`. Hide the action when `clientId` is undefined (button only makes sense with a tenant context).

### Out of scope

No DB migration, no RLS changes, no schema edits — uses the existing `notes` table, `useNotes` hook, and `dd_note_types`.

### Technical notes

- Edge function reuses the existing Lovable AI gateway pattern already in `extract-note-title` (same model, same error handling for 402/429).
- JWT verification matches `capture-outlook-email`'s approach (Authorization header → `supabase.auth.getUser`).
- `LinkedEmail.body_html` already exists in the hook; HTML→text conversion lives in the edge function (simple regex strip — no new dep).
