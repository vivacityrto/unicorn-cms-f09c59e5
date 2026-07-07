# PR-D — `bulk-generate-documents-launcher` + `bulk-generate-documents-worker` (final, with your five approvals folded in)

## Locked decisions

1. **Auth = Option A** — launcher forwards caller JWT to worker via `x-caller-authorization`; worker uses that value as `Authorization: Bearer …` for every downstream fetch and for its own fire-and-forget self re-invoke. **New:** any downstream 401 is tagged `error_code='auth_expired'` (not `deliver_failed` / `provision_failed` / `verify_failed`) so the ~1-hour token-expiry limitation is diagnosable in the data.
2. **Lease batch = 5** per `lease_bulk_document_job_items` call (matches the RPC's internal cap).
3. **Time budget = 50 000 ms hard cap**, checked before each lease.
4. **Format allowlist = `{docx, xlsx, xls, xlsm, pptx}`** — `documents.format.toLowerCase().trim()` compared against that literal set.
5. **Latest published version** = `document_versions WHERE document_id=? AND status='published' ORDER BY version_number DESC LIMIT 1` (matches `bulk-generate-phase-documents`).
6. **SharePoint bootstrap failure = do not record terminal outcome.** Skip the item (leave `state='leased'`); the natural stale-lock reclaim path (`reclaim_stale_bulk_document_locks`, bounded by `p_max_attempts=5`) handles retry. Accepts a ~5-minute "stuck-looking" window per your call.
7. **`cancel_bulk_document_job` correction** — this RPC is **NOT** worker-facing and **NOT** safe under service_role. The gate reads:
   ```sql
   IF v_creator <> v_user_id AND NOT public.check_permission(...) THEN RAISE EXCEPTION ...
   ```
   Under service_role, `auth.uid()` is NULL → `v_creator <> NULL` → NULL → PL/pgSQL treats NULL IF as false → the guard silently no-ops and the cancel always succeeds. The launcher only ever calls `cancel_...` with the real caller's JWT propagated (never service_role), so no live bug. But the design memo, worker source comments, and any follow-up docs must state explicitly: **`cancel_bulk_document_job` must always run under a real staff JWT, never service_role.** I'll bake that into the comment block at the top of both edge functions and mention it here so future changes don't route it through service_role.

## Called-out additions beyond exactly what you described

- `error_code='auth_expired'` on downstream 401 (your addition).
- `state` left at `'leased'` for SharePoint bootstrap failures rather than `'failed'` (your call).
- Cancellation runs under caller JWT only, explicitly documented in both edge functions to prevent future silent-bypass misuse.
- Nothing else — cron, UI wiring, and `reclaim_stale_bulk_document_locks` invocation scheduling are out of scope for this PR.

## Files

### `supabase/functions/bulk-generate-documents-launcher/index.ts` (new)

- Standard CORS, `verify_jwt=false` at platform, JWT validated in code with `supabase.auth.getClaims(token)`.
- Header comment includes: "`cancel_bulk_document_job` must always run under a real staff JWT — never service_role — because its permission gate silently no-ops when `auth.uid()` is NULL."
- Zod-validated body: `{ action: 'create'|'preview'|'cancel', scope?, tenant_ids?, package_ids?, stage_ids?, document_ids?, job_id?, reason? }`.
- Anon-key client with `global.headers.Authorization` = caller's header for every RPC (so `is_vivacity_internal_safe(auth.uid())` gates create/preview, and the composite `v_creator <> v_user_id` gate on cancel sees a real `auth.uid()`).
- `create` → returns `{ job_id }`; fire-and-forget POST to worker with `{ job_id }` body + `x-caller-authorization` header. No await.
- `preview` → returns the single-row result.
- `cancel` → returns the RPC result.
- Errors return `{ error, status, details }` with the real upstream status.

### `supabase/functions/bulk-generate-documents-worker/index.ts` (new)

- CORS, `verify_jwt=false`. Refuses to run if `x-caller-authorization` missing.
- Same header comment about `cancel_bulk_document_job`.
- `const WORKER_ID = crypto.randomUUID()` at handler top; logged on first line; used in every `lease_...` and `record_...` call in this invocation.
- Two clients:
  - `supabaseService` (service-role) — used for RPC calls to `lease_bulk_document_job_items` / `record_bulk_document_item_outcome`, and for reading `bulk_document_jobs.status`, `bulk_document_job_items`, `tenant_sharepoint_settings`, `document_versions`, `documents`, `package_instances`. These RPCs have no `auth.uid()`-based gates, so service_role is safe here.
  - `callerAuth` string — reused as the `Authorization` header for every downstream edge-function fetch and for the self re-invoke.
- Per-invocation caches:
  - `bootstrapCache: Map<tenant_id, { ok, transient? , errorCode?, errorMessage? }>` — `transient=true` on failure means "leave the item leased; don't record".
  - `repairCache: Map<tenant_id, { ok, errorMessage? }>`.
- Main loop pseudocode:
  ```text
  startedAt = Date.now()
  while (Date.now() - startedAt < 50_000):
      const { data: job } = supabaseService.from('bulk_document_jobs').select('status').eq('id', job_id).single()
      if (!job || job.status !== 'running') break
      const leased = await rpc('lease_bulk_document_job_items', { p_job_id: job_id, p_worker_id: WORKER_ID, p_limit: 5 })
      if (leased.length === 0) break
      for (const item of leased):
          try:
              const bootstrap = await ensureSharepoint(item.tenant_id)
              if (!bootstrap.ok):
                  if (bootstrap.transient):
                      // leave state='leased'; reclaim will retry
                      continue
                  await record(item.id, 'failed', bootstrap.errorCode, {}, bootstrap.errorMessage, bootstrap.errorCode)
                  continue
              const repair = await ensureRepair(item.tenant_id)
              if (!repair.ok):
                  // stage repair is a persistent config problem, not a transient Graph blip
                  await record(item.id, 'failed', 'stage_repair_failed', {}, repair.errorMessage, 'stage_repair_failed')
                  continue
              const version = await latestPublishedVersion(item.document_id)
              if (!version):
                  await record(item.id, 'skipped', 'no_published_version', {}, null, null); continue
              const fmt = ((await documentFormat(item.document_id)) || '').toLowerCase().trim()
              if (!['docx','xlsx','xls','xlsm','pptx'].includes(fmt)):
                  await record(item.id, 'skipped', 'unsupported_format', { format: fmt }, null, null); continue
              const resp = await fetch(deliverUrl, {
                  method:'POST',
                  headers: { Authorization: callerAuth, 'Content-Type':'application/json' },
                  body: JSON.stringify({ tenant_id: item.tenant_id, document_version_id: version.id, allow_incomplete: true, force: true })
              })
              if (resp.status === 401):
                  await record(item.id, 'failed', 'auth_expired', { http_status: 401 }, 'Caller JWT expired mid-job', 'auth_expired'); continue
              if (resp.ok):
                  const body = await resp.json()
                  await record(item.id, 'generated', null, body, null, null)
              else:
                  const text = (await resp.text()).slice(0, 2000)
                  await record(item.id, 'failed', 'deliver_failed', { http_status: resp.status }, text, `deliver_${resp.status}`)
          catch (e):
              console.error('[worker] item error', item.id, e)
              // do not rethrow; loop continues
  // budget hit or drained — re-invoke if there's still work
  const { data: postJob } = supabaseService.from('bulk_document_jobs').select('status').eq('id', job_id).single()
  if (postJob?.status === 'running'):
      const { count } = supabaseService.from('bulk_document_job_items')
          .select('id', { count: 'exact', head: true })
          .eq('job_id', job_id).in('state', ['pending','leased'])
      if ((count ?? 0) > 0):
          fetch(selfUrl, { method:'POST', headers:{ 'Content-Type':'application/json', 'x-caller-authorization': callerAuth },
                          body: JSON.stringify({ job_id }) })  // fire-and-forget
  return 200 { worker_id: WORKER_ID, processed, timed_out, remaining }
  ```
- **`record()` semantics.** `record_bulk_document_item_outcome` returns `boolean`. `false` → fenced/superseded → `console.warn`, continue, do **not** mark failed and do not retry. Thrown exceptions caught by the outer try; loop keeps going.
- **`ensureSharepoint(tenant_id)`.**
  1. If cached → return.
  2. Read `tenant_sharepoint_settings` (`provisioning_status`, `validation_status`, `governance_folder_item_id`).
  3. If not (`provisioning_status='success'` AND `validation_status='valid'`), POST `provision-tenant-sharepoint-folder` with `{ tenant_id }` + caller Authorization. Non-2xx → cache `{ok:false, transient:true, errorCode:'provision_failed', errorMessage:body.slice(0,2000)}`; 401 → cache `{ok:false, transient:false, errorCode:'auth_expired', ...}` (persistent for this invocation; item recorded as failed).
  4. Re-read row. If `governance_folder_item_id IS NULL`, POST `verify-compliance-folder` with `{ tenant_id }` + caller Authorization. Same handling; `errorCode:'verify_failed'` (transient) or `'auth_expired'` (persistent).
  5. Cache `{ok:true}`; return.
- **`ensureRepair(tenant_id)`.**
  1. If cached → return.
  2. Query `package_instances WHERE tenant_id=? AND is_active AND NOT is_complete AND membership_state='active'`.
  3. For each, `rpc('repair_package_instance_stages', { p_package_instance_id, p_dry_run:false })`. First failure → cache `{ok:false, errorMessage:err.message}` and return. All-ok → `{ok:true}`.

### No other file changes

No frontend, no other edge functions, no migrations, no `types.ts` edits.

---

## Acceptance test protocol (executed as part of this PR, in this order)

1. **Locate a safe target** with a read-only SQL probe: one `tenants` row with `status='active'`, `is_system_tenant=false`, at least one active `package_instance`, at least one `document_instance` whose `document.format ∈ {docx,xlsx,xls,xlsm,pptx}` and whose `document_id` has a `document_versions` row with `status='published'`, and `tenant_sharepoint_settings.provisioning_status='success' AND validation_status='valid'` (so this run tests the generator path, not SharePoint provisioning). Prefer a Vivacity-internal or clearly test tenant if available.
2. **Confirm the target with you** — tenant name, tenant_id, document title, document_id, version_id — **before** creating the job. Wait for approval.
3. `supabase--curl_edge_functions` → `POST /bulk-generate-documents-launcher` with `{ action:'create', scope:'selected', tenant_ids:[T], document_ids:[D] }`. Paste response.
4. Poll `bulk_document_jobs` + `bulk_document_job_items` for that `job_id` every ~3s up to 60s. Paste all row transitions: job (`status`, counts, `started_at`, `finished_at`) and item (`state` progression, `reason`, `error`, `error_code`, `worker_id`, `outcome` excerpt).
5. Query `governance_document_deliveries` for `(tenant_id=T, document_version_id=V)`; paste the row(s) so the SharePoint landing is visible.
6. Confirm WORKER_ID discipline: item's `worker_id` == the value the worker's own first log line printed. Paste both.
7. If any step is off (job stuck, item stuck `leased` unexpectedly, WORKER_ID mismatch, unexplained `failed`), stop and report — do not claim done.

## Rollback

Delete the two `supabase/functions/bulk-generate-documents-*` directories. No schema state; any in-flight job stays in tables as history. Close it with `cancel_bulk_document_job(id, 'rolled_back')` from a staff session if needed.

## Post-deploy sanity queries

```sql
-- Every recorded outcome carries a worker_id
SELECT COUNT(*) FROM public.bulk_document_job_items
WHERE state IN ('generated','skipped','failed') AND worker_id IS NULL; -- expect 0

-- No orphan 'leased' rows older than 2h (reclaim territory, but should be empty right after this PR ships)
SELECT COUNT(*) FROM public.bulk_document_job_items
WHERE state='leased' AND leased_at < now() - interval '2 hours'; -- expect 0
```

Ready to build on approval.