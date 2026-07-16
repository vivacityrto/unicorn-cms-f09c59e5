# Unlink Email Feature

Add an "Unlink" action to each row in the Linked Emails list on the client Emails tab. Unlinking permanently removes the email and every trace connected to it: attachment files in storage, attachment rows, and any notes that were created from that email via the "Convert to Note" flow.

## Scope of "traces"

Today, converting an email to a note copies the AI-generated title/body into a new `notes` row but does not record a back-reference. Without a back-reference we can't reliably identify which notes came from which email, so unlinking cannot clean them up. The plan adds that back-reference first, then wires unlink to use it.

Traces removed on unlink:
1. Files in the `email-attachments` storage bucket for that email.
2. Rows in `email_message_attachments` for that email.
3. The row in `email_messages`.
4. Any rows in `notes` whose new `source_email_id` matches.

Notes converted **before** this change won't have `source_email_id` set, so they won't be auto-deleted. Users can delete those manually. (Called out in the confirm dialog copy.)

## Changes

### 1. DB migration
- Add `source_email_id uuid` (nullable, indexed) to `public.notes`.
- No FK — email rows are deletable independently and we tolerate dangling ids.

### 2. `ConvertEmailToNoteDialog.tsx`
- Pass `source_email_id: email.id` through `createNote(...)` so the linkage is recorded going forward.
- Requires `useNotes.createNote` to forward the field (verify + extend the payload shape).

### 3. `useLinkedEmails.tsx`
- Add `unlinkEmail(emailId)` mutation that:
  1. Lists `email_message_attachments` for the email, calls `supabase.storage.from('email-attachments').remove([...paths])`.
  2. Deletes `email_message_attachments` rows for the email.
  3. Deletes `notes` rows where `source_email_id = emailId`.
  4. Deletes the `email_messages` row.
  5. Invalidates the `linked-emails` query and any notes queries for the tenant.
- Surfaces toast success/failure. Errors on storage cleanup are logged but don't block DB deletion (best-effort).

### 4. `LinkedEmailsList.tsx` / `EmailCard`
- Add an "Unlink" icon button (Unlink2 / Trash2 icon) next to the existing Convert-to-Note and View buttons.
- On click, open an AlertDialog:
  - Title: "Unlink this email?"
  - Body: warns that the email, its attachments, and any notes created from it via Convert-to-Note will be permanently deleted, and that older converted notes (pre-feature) won't be touched.
  - Confirm calls `unlinkEmail(email.id)`.

### 5. Verification
- Manually unlink a test email with attachments + a converted note in the preview; confirm all rows/files/notes are gone and the list refreshes.

## Technical notes

- Deletion order matters: storage first, then attachment rows, then notes, then the email row (attachments rely on the parent id for lookup).
- Existing RLS on `email_messages`, `email_message_attachments`, and `notes` already restricts to same-tenant staff, so DELETE from the client is safe.
- No edge function needed — everything runs through the Supabase JS client under the caller's JWT.
