# PR-A (revised) — Rate-limit fix on `bulk-generate-phase-documents`

You're right. Verified against the live DB and against the file's own audit insert.

## Verified facts

**`public.audit_events` columns** (live): `id uuid, entity text, entity_id uuid, action text, user_id uuid, details jsonb, created_at timestamptz`. No top-level `tenant_id`.

**Where `tenant_id` actually lives**: inside `details` as a JSON number. The same file writes it that way at lines 120–121 and again in the failure-path audit insert at ~line 386. Confirmed with a real row query — 5 latest matching rows all show `jsonb_typeof(details->'tenant_id') = 'number'` and `details->>'tenant_id'` returns the tenant id as text (e.g. `'6372'`, `'7473'`).

**Consequence of my earlier `.eq('tenant_id', tenant_id)`**: PostgREST returns an error, the destructure drops it (`const { data: recentBulk } = ...` with no `error` handling), `recentBulk` is `null`, `if (recentBulk && …)` is false, and the rate limit stops firing at all — regression, not a fix. Good catch.

## Correct change

Filter the JSONB path with a string-typed value (`->>` is text-extract, and the details value happens to be a JSON number, so the comparand must be stringified):

```ts
const { data: recentBulk, error: recentBulkErr } = await supabase
  .from('audit_events')
  .select('id')
  .eq('entity', 'bulk_generate')
  .eq('action', 'bulk_generate_phase_documents')
  .eq('details->>tenant_id', String(tenant_id))   // ← added, JSONB path
  .gte('created_at', fiveMinAgo)
  .limit(1);

if (recentBulkErr) {
  console.error('[bulk-gen] rate-limit lookup failed', recentBulkErr);
  // fail-closed: don't let a broken filter silently disable the guard
  return jsonResponse({ success: false, error: 'Rate limit check failed' }, 500);
}
```

Two changes vs the previous incorrect draft:
1. **`details->>tenant_id` instead of a non-existent top-level `tenant_id` column.** Confirmed working against the live table.
2. **Capture and surface the query error.** Silent `error` discard is what let the original bug hide, and it would hide any future PostgREST syntax regression too. Fail-closed on lookup error is the right default for a rate-limit guard.

## Acceptance test (must pass before merge)

Run in this exact order against the same deployed function:

1. Tenant A → Generate All. Expect 200.
2. Tenant A → Generate All within 5 minutes. **Expect 429** with `Rate limited. Please wait 5 minutes...`.
3. Tenant B (any different tenant) → Generate All within the same window. **Expect 200**, not 429.
4. Confirm no new error rows in the edge-function logs for `[bulk-gen] rate-limit lookup failed`.

Step 2 is the one my previous version would have failed. If steps 2 and 3 both behave as above, the fix is correct.

## Deploy

1. Edit `supabase/functions/bulk-generate-phase-documents/index.ts` at ~lines 163–176 (the `recentBulk` block) with the diff above.
2. Deploy via `supabase--deploy_edge_functions` with `["bulk-generate-phase-documents"]`.
3. Run the four-step acceptance test.

## Rollback

Revert the block to the current version (unfiltered query, no error surfacing) and redeploy. The global-lockout bug returns but no schema or data unwinds.

## Risk

Low. The JSONB path filter is confirmed against the live table and matches how every current writer serialises `tenant_id`. Fail-closed on lookup error can produce a 500 if PostgREST ever changes JSONB filter syntax; that's noisier than the silent regression it replaces and easier to detect.

## What still ships after this

PR-B: `bulk_document_jobs` / `bulk_document_job_items` tables + grants + RLS, per Prompt 2b/2c. Awaiting your go on this revised PR-A first.
