

# Bulk Document Generation per Phase

## Summary
Add a "Generate All Documents" action at the phase (stage) level, so consultants can trigger generation for all auto-generated documents in a phase at once, instead of generating them one-by-one per client.

## Current State
- `generate-excel-document` edge function processes one document at a time (single `document_id`)
- `StageDocumentsSection` lists documents per phase but has no generation actions
- `GeneratedDocumentsTab` has individual "Generate" buttons per document
- No bulk/batch generation endpoint exists

## Plan

### 1. New Edge Function: `bulk-generate-phase-documents`

Create `supabase/functions/bulk-generate-phase-documents/index.ts`:

- Accepts: `tenant_id`, `stageinstance_id`, `package_id` (optional), `mode` (`all` or `pending_only`)
- Fetches all `document_instances` for that `stageinstance_id` + `tenant_id`
- Joins to `documents` table to get template metadata (format, `is_auto_generated`, merge fields, file paths)
- Filters to only auto-generatable documents (Excel/DOCX with `is_auto_generated = true`)
- For each eligible document, calls the existing `processExcelTemplate` logic inline (or invokes `generate-excel-document` per doc)
- Returns a summary: `{ total, generated, skipped, failed, results[] }`
- Logs a single `audit_events` entry for the bulk action

### 2. Update `StageDocumentsSection` UI

Add a "Generate All" button in the documents header bar (next to the count badge):

- Button text: "Generate All" with a Sparkles icon
- Only visible for SuperAdmin / Vivacity staff roles
- Shows a confirmation dialog: "Generate all eligible documents for this phase? X documents will be processed."
- During generation: shows progress (e.g., "Generating 12/195...")
- On completion: shows toast with summary and triggers refetch
- Skips documents that are already generated (unless a "Regenerate" option is checked)

### 3. New Hook: `useBulkGeneration`

Create `src/hooks/useBulkGeneration.ts`:

- Wraps the call to `bulk-generate-phase-documents`
- Manages loading/progress state
- Returns `{ bulkGenerate, generating, progress }`

### 4. Update `supabase/config.toml`

Register the new `bulk-generate-phase-documents` function.

## Technical Details

### Edge Function Flow

```
1. Validate auth + tenant access
2. Query document_instances WHERE stageinstance_id = X AND tenant_id = Y
3. Join documents table for template info
4. Filter: is_auto_generated = true AND format IN ('xlsx','xls','docx')
5. For each document:
   a. Resolve merge data (tenant fields, client fields)
   b. Download template from storage
   c. Process template with merge data
   d. Upload generated file
   e. Update document_instance status to 'generated'
   f. Record in generated_documents table
6. Return summary
```

### UI Component Changes

In `StageDocumentsSection.tsx`:
- Add props: `packageId` (needed for generation context)
- Add "Generate All" button in the header bar
- Add confirmation dialog before triggering
- Add progress indicator during bulk generation

### Safety

- Rate limited: one bulk generation per tenant per 5 minutes (checked server-side)
- Max batch size: 500 documents per call
- Existing generated documents are skipped by default
- Full audit trail logged to `audit_events`

## Files to Create/Edit

| File | Action |
|------|--------|
| `supabase/functions/bulk-generate-phase-documents/index.ts` | Create |
| `src/hooks/useBulkGeneration.ts` | Create |
| `src/components/client/StageDocumentsSection.tsx` | Edit - add Generate All button |
| `src/components/client/PackageStagesManager.tsx` | Edit - pass packageId to StageDocumentsSection |
| `supabase/config.toml` | Edit - register new function |

