# Fix build errors in current edit branch

## Context
The current working tree (clean) on the Lovable edit branch has three TypeScript build errors that block the preview. These need to be resolved before continuing with the regulatory-updates work.

## Errors to fix

1. **`src/components/client/StageDocumentsSection.tsx:100` — TS2589**
   `supabase.from('bulk_document_job_items').select('job_id, bulk_document_jobs!inner(status)')...`
   The typed Supabase client is recursing on the `!inner` foreign-table join.
   **Fix:** Add an explicit `.returns<{ job_id: string }[]>()` (or equivalent cast) to break the deep type instantiation.

2. **`src/hooks/useAcademyCourses.ts:101` — TS2322**
   Mapped rows have `thumbnail_fit: string`, but `AcademyCourseRow` expects `"contain" | "cover"`.
   **Fix:** Cast the spread course object's `thumbnail_fit` to the union type, e.g. `thumbnail_fit: c.thumbnail_fit as AcademyCourse['thumbnail_fit']`.

3. **`src/pages/ManageDocuments.tsx:2407/2433` — TS2339**
   `doc.stage` no longer exists on the `Document` type after the multi-stage association migration (`document_stage_links` replaces the single `stage` column).
   **Fix:**
   - Query the document's primary stage from `document_stage_links` (or include it in the existing fetch).
   - Replace `doc.stage` references with the resolved primary stage value.
   - Update the `update({ stage: ... })` call to write to `document_stage_links` instead, or use the existing `DocumentAdditionalStagesField` / primary-stage helper already in use elsewhere.

## Verification
Run `npm run build` (or `npx tsc --noEmit`) and confirm zero errors before returning to the regulatory-updates feature.
