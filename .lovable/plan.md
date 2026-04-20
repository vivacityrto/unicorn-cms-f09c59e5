

## Plan: Show template attachments in Compose Email modal

### Data flow
The `ComposeEmailDialog` receives `emailInstanceId` (FK to `email_instances`). To resolve attachments we need the underlying template `emails.id`:

1. Query `email_instances` for the row's `email_id` (template id), OR have the parent (`StageEmailsSection`) pass `email_id` as a new prop. Cleaner: add an optional `emailTemplateId?: number` prop and pass `email.email_id` from `useStageEmails` (already selected in the hook query).
2. With the template id, run:
   ```sql
   SELECT d.id, d.title, d.format,
          df.file_path, df.original_filename
   FROM email_attachments ea
   JOIN documents d ON d.id = ea.document_id
   LEFT JOIN document_files df ON df.document_id = d.id
   WHERE ea.email_id = :emailTemplateId
   ORDER BY ea.order_number NULLS LAST, ea.created_at
   ```
   Note: `document_files` is one-to-many; we'll take the most recent per document (order by `created_at desc`, group client-side, pick first).

### Changes

**1. `src/hooks/useEmailAttachments.ts` (new)**
- React Query hook: `useEmailAttachments(emailTemplateId?: number)`.
- Returns `{ attachments, loading }` where each item: `{ documentId, title, format, filePath | null, originalFilename | null }`.
- `enabled: !!emailTemplateId`.

**2. `src/components/client/EmailAttachmentChips.tsx` (new)**
- Renders nothing if `attachments.length === 0`.
- Otherwise renders an `ATTACHMENTS` label (matching the `To:` / `Subject:` style — `grid-cols-[60px_1fr]`) and a wrap row of chips.
- Chip:
  - Icon: `FileSpreadsheet` (green) for `xlsx`, `FileText` (blue) for `docx`, generic `File` otherwise.
  - Title text + small `Badge` for `format`.
  - If `filePath` is null → greyed `opacity-50`, `Lock` icon, tooltip "File not yet uploaded to document library", non-clickable.
  - If `filePath` exists → button that calls `supabase.storage.from('documents').createSignedUrl(filePath, 60)` and opens in new tab.
- Read-only — no edit/remove controls.

**3. `src/components/client/ComposeEmailDialog.tsx`**
- Add prop `emailTemplateId?: number`.
- In Compose tab: insert `<EmailAttachmentChips emailTemplateId={emailTemplateId} />` after the Body block (line 207).
- In Preview tab: insert the same component below the body preview card (after line 226).

**4. `src/components/client/StageEmailsSection.tsx`**
- Pass `emailTemplateId={composeEmail.email_id}` to `ComposeEmailDialog`.
- Update `useStageEmails` `StageEmail` interface to expose `email_id` (already selected in the query — just surface it on the returned object).

**5. Other callers** (`StaffTaskActionMenu.tsx`, `ClientStructuredNotesTab.tsx`)
- No change required — `emailTemplateId` is optional; chips simply won't render when omitted.

### Storage bucket
Reuse existing `documents` bucket signed-URL pattern (already used elsewhere in the codebase, e.g. `useSuggestAttachments.getAttachmentSignedUrl`). No new bucket / RLS work needed — chips are read-only and client already has read access to `documents` rows their tenant can see.

### Files changed
- New: `src/hooks/useEmailAttachments.ts`
- New: `src/components/client/EmailAttachmentChips.tsx`
- Edit: `src/components/client/ComposeEmailDialog.tsx` (new prop + render in both tabs)
- Edit: `src/components/client/StageEmailsSection.tsx` (pass `email_id`)
- Edit: `src/hooks/useStageEmails.ts` (expose `email_id` on returned objects)

No DB changes, no RLS changes, no new buckets.

