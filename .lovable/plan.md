

## Add `document_title` to `document_instances` for Resilience Against Deleted Documents

### Problem
When a source document is deleted from the `documents` table, any `document_instances` referencing it lose their title — they display as "Document #1234" because the JOIN returns nothing. This happens periodically and leaves legacy/historical data without meaningful labels.

### Solution
Add a `document_title` column to `document_instances` that captures the document title at creation time. This acts as a denormalized fallback — the UI continues to prefer the live `documents.title` but falls back to `document_instances.document_title` when the source is gone.

### Changes

**1. Database migration**
- Add `document_title TEXT NULL` column to `document_instances`
- Backfill existing rows from the `documents` table where the source still exists

```sql
ALTER TABLE public.document_instances 
  ADD COLUMN document_title text NULL;

UPDATE public.document_instances di
SET document_title = d.title
FROM public.documents d
WHERE di.document_id = d.id;
```

**2. Update `publish_stage_version` RPC**
- Modify the function so that when it inserts new `document_instances`, it also populates `document_title` from the source `documents.title`.

**3. Update `useStageDocuments.ts`**
- Include `document_title` in the select query
- Change the title fallback: use `meta?.title || inst.document_title || 'Document #...'`

**4. Update `StageDocumentsPanel.tsx` (Link Documents dialog)**
- When manually linking documents, populate `document_title` on insert

**5. Update Document Sync Audit (`DocListDialog`)**
- When displaying document names for missing/extra docs, fall back to `document_title` from `document_instances` when the source document no longer exists

### What stays the same
- The live `documents.title` remains the primary source when available
- No changes to RLS policies (the new column inherits the existing row-level policies)
- Audit trail is preserved — no existing data is modified beyond the backfill

