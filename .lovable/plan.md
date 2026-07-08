## Goal

Turn the current one-click "Retry Failed & Pending" button into a **retry dialog** where the user can uncheck items they don't want to retry (e.g. items that will never succeed — no-template docs, docs that keep hanging like Q4.D3 for a specific tenant). Unchecked items are permanently excluded from this job so they don't reappear on the next retry.

## Scope check — what "no template file" means today

The worker already handles the trivial no-template case: docs whose template can't be found are recorded with `state = 'skipped'` and `last_error_code = 'no_template'`. They are **not** in the retry-eligible set to begin with. So the actual user problem is broader: some `failed` items (e.g. `LEASE_EXPIRED_MAX_ATTEMPTS` on Q4.D3 for Think Real Estate) will keep failing forever and the user wants to drop them from further retry attempts. The plan below covers that general case — "no template" is included implicitly if any such items exist as `failed`.

## UX

Replace the current instant retry with a dialog:

```text
┌─ Retry Failed & Pending ─────────────────────────────┐
│ Uncheck any items you don't want to retry. Unchecked │
│ items will be marked as skipped on this job.         │
│                                                       │
│ ▸ Think Real Estate.            [☐ 1 of 1]            │
│    ☐ Q4.D3-RTO Master Compliance Charter             │
│       Lease Expired Max Attempts                     │
│ ▸ EduCareer College             [☑ 3 of 4]            │
│    ☑ Q1.D1-Training Policy                            │
│    ☑ Q3.D1-Trainers Handbook                          │
│    ☐ Q4.D3-RTO Master Compliance Charter             │
│    ☑ Q2.D5-Feedback Complaints and Appeals Policy    │
│                                                       │
│ [Cancel]      [Retry 15 items · Skip 2 items]        │
└───────────────────────────────────────────────────────┘
```

- Grouped by tenant, same visual style as the existing per-tenant collapsibles on the page.
- Row label: document title + `errorCodeLabel(last_error_code)` (or "Lease expired" for `LEASE_EXPIRED_MAX_ATTEMPTS`).
- Tenant-level checkbox toggles all rows for that tenant.
- Confirm button label reflects both counts. If everything is unchecked, the button is disabled.
- If the eligible set is small (say ≤ 1 item and no stall), we could preserve the current instant-retry behaviour — out of scope for this change; always show the dialog for consistency.

## Backend

Add one new SQL migration that introduces a helper RPC:

```sql
CREATE OR REPLACE FUNCTION public.skip_bulk_document_job_items(
  p_job_id uuid,
  p_item_ids bigint[]
) RETURNS int
LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
DECLARE
  v_caller uuid := auth.uid();
  v_creator uuid;
  v_moved int := 0;
BEGIN
  IF v_caller IS NULL THEN
    RAISE EXCEPTION 'Authentication required' USING ERRCODE = '42501';
  END IF;

  SELECT created_by INTO v_creator FROM public.bulk_document_jobs WHERE id = p_job_id;
  IF v_creator IS NULL THEN
    RAISE EXCEPTION 'bulk_document_jobs % not found', p_job_id USING ERRCODE = '02000';
  END IF;
  IF v_caller <> v_creator AND NOT public.is_vivacity_internal_safe(v_caller) THEN
    RAISE EXCEPTION 'Only the creator or Vivacity staff may modify a job' USING ERRCODE = '42501';
  END IF;

  WITH moved AS (
    UPDATE public.bulk_document_job_items
    SET state = 'skipped',
        last_error_code = COALESCE(last_error_code, 'excluded_on_retry'),
        last_error = COALESCE(last_error, 'Excluded on retry by user'),
        finished_at = COALESCE(finished_at, now())
    WHERE job_id = p_job_id
      AND id = ANY(p_item_ids)
      AND state IN ('failed', 'cancelled')
    RETURNING 1
  )
  SELECT COUNT(*) INTO v_moved FROM moved;

  -- Reflect the state move in the job's aggregate counts.
  UPDATE public.bulk_document_jobs
    SET failed_count = GREATEST(0, failed_count - v_moved),
        skipped_count = skipped_count + v_moved
   WHERE id = p_job_id;

  RETURN v_moved;
END;
$$;

REVOKE ALL ON FUNCTION public.skip_bulk_document_job_items(uuid, bigint[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.skip_bulk_document_job_items(uuid, bigint[]) TO authenticated;
```

Only touches `failed`/`cancelled` items — cannot affect `generated`, `pending`, or currently `leased` items. `retry_bulk_document_job` stays exactly as-is; it will simply see the excluded items in `skipped` state (which it ignores) on its next call.

## Frontend

Files:
- `src/components/documents/bulk-generate/useBulkGenerateLauncher.ts` — add `launcherSkipItems(job_id, item_ids)` that invokes the launcher with `action: 'skip_items'`. Follows the same pattern as `launcherRetry` (session refresh + error unwrap).
- `supabase/functions/bulk-generate-documents-launcher/index.ts` — add a `skip_items` action that calls `supabase.rpc('skip_bulk_document_job_items', { p_job_id, p_item_ids })` under the caller JWT (same auth path as `retry`). Zod enum gains `'skip_items'`.
- `src/pages/BulkDocumentJobProgress.tsx`:
  - Add a `RetryDialog` component (co-located in the same file or a small new file next to `jobStatusPill`).
  - Change `onRetry` to open the dialog instead of firing immediately.
  - Dialog receives the current retry-eligible items (reuse the existing `eligibleRetry` filter as the source list) with `tenantNames` and `documentTitles` maps for display.
  - On confirm: if any items are unchecked, call `launcherSkipItems(jobId, excludedIds)`; then always call `launcherRetry(jobId)`; then invalidate the two job queries.
  - If the user unchecks everything and confirms, call `launcherSkipItems` only (no retry), close the dialog, and toast "Excluded items skipped".
- `src/components/documents/bulk-generate/errorCodeLabel.ts` — add `excluded_on_retry: "Excluded on retry"` to `LABELS` so the skipped rows read correctly in the main table.

## Non-goals

- No changes to `retry_bulk_document_job`, the worker, or `deliver-governance-document`.
- No new query — the dialog reuses the already-fetched `items` list.
- No change to `launcherCancel` or the cancel flow.
- Does not attempt to auto-detect "no template" separately; those items are already `skipped` upstream and won't appear in the dialog.

## Verification

- Load a job with mixed failed items; click Retry; confirm dialog lists them grouped by tenant with error labels.
- Uncheck one row, confirm; DB shows that item now `state = 'skipped'`, `last_error_code = 'excluded_on_retry'`, job's `failed_count` decreased by 1, `skipped_count` increased by 1; the other items reset to `pending` and job resumes.
- Uncheck everything, confirm; no retry fires, only the skip RPC runs; job either completes (if nothing left) or stays stalled with no new work.
- Re-open the same job — excluded items now render with the "Excluded on retry" label in the main table, no longer counted as retry-eligible.
