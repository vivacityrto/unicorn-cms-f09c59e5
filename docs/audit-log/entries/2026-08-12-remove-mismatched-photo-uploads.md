# Audit: 2026-08-12 — Removed mismatched photo uploads from 4 documents

**Trigger:** Follow-up from the file-status readiness fix
(`docs/audit-log/entries/2026-08-12-manage-documents-duplicate-cleanup.md`
and the file-status tab fix, #249). Carl asked to analyse the 12
"Ready"-but-no-SharePoint-link documents and identify what actually made
them ready.
**Author:** Claude (session run by Carl)
**Scope:** Data-only cleanup — cleared 4 documents' legacy file references
and removed 4 incorrect `document_versions` rows. No RLS, trigger, or edge
function changes. No new tables. Underlying storage objects intentionally
left untouched (see Decisions).
**Supabase project:** hosted `unicorn-cms-f09c59e5` production project.

---

## Findings

- Of the 131 documents correctly marked "Ready" post-fix, 12 have no
  SharePoint link (`source_template_url`) — meaning their readiness comes
  from a real `document_versions.storage_path` instead. Split cleanly into
  two groups by comparing the uploaded file's extension against the
  document's declared `format`:
  - **8 genuinely ready**: real files uploaded 2026-01-07 via a structured
    `stages/70/2026/01/<uuid>-<Title>.<ext>` path, file name matching the
    document title, extension matching `format` exactly.
  - **4 false positives**: `format = 'docx'` but the actual uploaded file
    is an unrelated image — `Angela Connell-Richards.png` (id 1, "TAS -
    Training Needs Analysis"), `1763536758540-xa9rfn.jpg` (id 2, "TAS -
    Staff Matrix"), `New Vivacity Logo (2) 1.png` (id 4, "TAS - Assessment
    Validation Schedule"), `Kelly Xu 2.png` (id 57, "TAS - Training Needs
    Analysis-RTOName-DDMMMYY"). Confirmed via `storage.objects` metadata:
    all four are real, correctly-uploaded image files (47 KB–1.19 MB,
    `image/jpeg`/`image/png`) — genuinely the wrong file, not a broken
    reference.
  - id 57 is the same document flagged during the original duplicate
    cleanup (its sibling, id 58, was deleted then as a redundant copy) —
    this shows the mismatched-photo pattern wasn't isolated to that one
    document, it recurs across the same Oct–Dec 2025 import batch.
- The readiness check fixed in #249 (requiring a non-empty
  `document_versions.storage_path`) correctly identifies "has real
  content," but can't tell whether that content is the *right* content.
  Extension-vs-`format` mismatch is a distinct, reliable signal for that.
- Verified zero downstream references to the 4 incorrect
  `document_versions` rows before removing: 0 rows in
  `governance_document_deliveries` (`document_version_id`), 0 in
  `documents.current_published_version_id`, 0 in
  `stage_documents.pinned_version_id`.

---

## DB changes shipped

Migration: `supabase/migrations/20260812022846_remove_mismatched_photo_uploads.sql`

```sql
DELETE FROM document_versions WHERE id IN (
  '7d65bfc0-61a8-4b09-bdca-cc416bea872c', '3ae29098-a7a0-4ab8-9ed8-75d6d787a9b5',
  'b689c121-7961-4f57-b55c-760c4b5f9042', '821e6bc9-6af8-4ab4-acf6-0969f184aeef'
);
UPDATE documents SET uploaded_files = NULL, file_names = NULL WHERE id IN (1, 2, 4, 57);
```

Applied directly to prod via Supabase MCP `apply_migration`, with Carl's
explicit approval. Verified post-apply: all 4 documents now have
`uploaded_files IS NULL`, `file_names IS NULL`, and no remaining
`document_versions` row — they will correctly show as "Needs Upload."

---

## Code changes (if this entry accompanies one)

- `supabase/migrations/20260812022846_remove_mismatched_photo_uploads.sql`
  — see above. No frontend changes (the readiness logic itself was already
  fixed in #249; this entry only cleans up data that logic correctly
  flagged as needing a real look).

Branch: `hotfix/remove-mismatched-photo-uploads`.

---

## Decisions

- **Did not delete the underlying image files from the `document-files`
  storage bucket.** They're now fully unreferenced by any document, but
  deleting `storage.objects` rows directly via SQL bypasses the Storage
  API's cleanup path and isn't guaranteed to actually free the backing
  blob — safer to leave them as orphaned-but-harmless storage objects than
  risk an inconsistent state. If reclaiming that space matters, delete
  them via the Supabase Studio Storage UI or the Storage REST API instead
  of a raw migration.
- **Removed the `document_versions` row entirely rather than clearing its
  `storage_path` to `''`** (matching the empty-placeholder pattern seen
  elsewhere in this catalog). The row represented a genuinely wrong upload
  event, not a legitimate "no file yet" placeholder — keeping it around
  with a blanked path would misrepresent the document's version history.

---

## Open questions parked

- Only these 4 mismatched-photo cases were found among the 131 "Ready"
  documents (the ones with no SharePoint link — 119 others were not
  individually audited for the same extension-mismatch pattern, since
  most of those 119 rely on a SharePoint link rather than a Supabase
  storage upload as their readiness signal). If a similar mismatch exists
  among SharePoint-linked documents, it wasn't checked for here.
