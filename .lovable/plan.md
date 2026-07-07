## PR-D fixes — repair-JWT + `worker_id` retention + `generated` state alignment

Three defects, one migration + one worker edit. All folded into one shot.

### Pre-check (done)
Grep + `pg_proc` scan confirms the only reference to `'succeeded'` anywhere in the codebase or DB for `bulk_document_job_items` is inside `record_bulk_document_item_outcome` itself. Nothing else needs updating for the state rename.

### Defect 1 — `repair_package_instance_stages` must run under caller JWT
File: `supabase/functions/bulk-generate-documents-worker/index.ts`
- Add a second Supabase client at request scope: `supabaseCaller` = anon-key client with `global.headers.Authorization = callerAuth`.
- In `ensureRepair()`, call `supabaseCaller.rpc('repair_package_instance_stages', ...)` instead of `supabaseService.rpc(...)`.
- Keep the `package_instances` list read on `supabaseService`.
- Update header comment's "Auth model" list to include `repair_package_instance_stages`.

### Defect 2 + 3 — one migration
Applied via `supabase--migration`. Called out as a live RPC edit per standing process. Runs as a single transaction, in this order:

1. **Constraint swap** on `public.bulk_document_job_items`:
```sql
ALTER TABLE public.bulk_document_job_items
  DROP CONSTRAINT bulk_document_job_items_state_check;
ALTER TABLE public.bulk_document_job_items
  ADD CONSTRAINT bulk_document_job_items_state_check
  CHECK (state = ANY (ARRAY['pending','leased','generated','skipped','failed','cancelled']));
```
No live rows use `'succeeded'` (table is brand-new; verified). No data backfill needed.

2. **`CREATE OR REPLACE FUNCTION public.record_bulk_document_item_outcome(...)`** with:
   - Guard: `IF p_state NOT IN ('generated','skipped','failed')`
   - `SET` clause drops `worker_id = NULL` (retains `lease_expires_at = NULL`)
   - Job counter: `generated_count += CASE WHEN p_state='generated' THEN 1 ELSE 0 END`
   - All other logic byte-identical: SECURITY DEFINER, `search_path=''`, fencing `WHERE state='leased' AND worker_id=p_worker_id`, `RETURN false` on fenced, roll-up + auto-complete tail unchanged, signature unchanged, grants inherit.

### Worker code — no state-name changes needed
Worker already sends `'generated'`. Only Defect 1 edit is required in code.

### Acceptance test (re-run from scratch)
Target: tenant `7547`, document `7360`, version `b5e1557b-36d2-427c-ad60-be532e8df32b`.
1. Apply migration; deploy worker.
2. POST launcher `create` `{scope:'selected', tenant_ids:[7547], document_ids:[7360]}` under caller JWT.
3. Poll `bulk_document_jobs` + `bulk_document_job_items` every ~3s up to 60s.
4. Assert: item `state='generated'`, `worker_id` non-null, `outcome` has delivery payload, no `last_error*`; job `status='completed'`, `generated_count=1`, `failed_count=0`.
5. Confirm a fresh row in `governance_document_deliveries` for tenant 7547 / doc 7360.
6. Global sanity: `SELECT count(*) FROM bulk_document_job_items WHERE state IN ('generated','skipped','failed') AND worker_id IS NULL` → **must return 1** (the historical pre-fix failure on job `ecfe0b26-…` item 1) and no more. Any additional rows fail the test.
7. Paste every artifact back — launcher body, job row, item row, delivery row, sanity count. Stop and report if anything is off.

### Rollback
- Worker: revert the client-swap in `ensureRepair()`.
- Migration: prior `record_bulk_document_item_outcome` body + reinstate old CHECK with `'succeeded'`. No data cleanup needed.
