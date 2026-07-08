## Fix `ensureSharepoint()` to use live SharePoint check

Replace the DB-flag-only bootstrap logic in `supabase/functions/bulk-generate-documents-worker/index.ts` (lines 143–221) with a live liveness probe before any provisioning decision.

### New flow inside `ensureSharepoint(tenantId)`

1. **Cache check** — unchanged. Return `bootstrapCache.get(tenantId)` if present.

2. **Liveness call** — before touching `tenant_sharepoint_settings`, POST to `${SUPABASE_URL}/functions/v1/check-tenant-sharepoint-liveness` with:
   - Headers: `Content-Type: application/json`, `Authorization: callerAuth` (same forwarding as existing provision/verify calls).
   - Body: `{ tenant_ids: [tenantId] }`.
   - On non-2xx: cache and return
     - `{ ok: false, transient: false, errorCode: 'auth_expired', errorMessage }` if `status === 401`
     - `{ ok: false, transient: true, errorCode: 'liveness_check_failed', errorMessage }` otherwise (new error code).
   - Parse `results[0]` → `{ shared, governance }` where each is `'ok' | 'missing' | 'unconfigured' | 'error'`. If `results[0]` is absent, treat as `liveness_check_failed` transient.

3. **Shared folder branch** on `results[0].shared`:
   - `'ok'` → no action.
   - `'missing'` → POST `provision-tenant-sharepoint-folder` with `{ tenant_id: tenantId, force: true }` (force required because that function no-ops when `provisioning_status === 'success'`).
   - `'unconfigured'` → POST `provision-tenant-sharepoint-folder` with `{ tenant_id: tenantId }` (no force).
   - `'error'` → cache and return `{ ok: false, transient: true, errorCode: 'settings_read_failed', errorMessage: liveness.error ?? 'shared liveness error' }` (mirrors the current transient-settings path so `reclaim_stale_bulk_document_locks` retries).
   - Non-2xx from provision → same 401 / non-401 classification as today (`auth_expired` / `provision_failed`).

4. **Governance folder branch** on `results[0].governance`:
   - `'ok'` → no action.
   - `'missing'` or `'unconfigured'` → POST `verify-compliance-folder` with `{ tenant_id: tenantId }` (this function does its own live Graph check and self-heals a stale `governance_folder_item_id`).
   - `'error'` → same transient `settings_read_failed`-style entry as shared `'error'` above.
   - Non-2xx from verify → same 401 / non-401 classification as today (`auth_expired` / `verify_failed`).

5. **Success** — cache and return `{ ok: true }`.

### Removed
- The `tenant_sharepoint_settings` `.select('provisioning_status, validation_status, governance_folder_item_id')` read at lines 147–162.
- The `needsProvision` derivation at lines 164–168.
- The re-read of `governance_folder_item_id` at lines 191–197.

The `sErr` transient-read path disappears with the read; the equivalent transient error is now surfaced from either the liveness call (`liveness_check_failed`) or `'error'` states on the liveness result (`settings_read_failed`).

### Unchanged
- `BootstrapCacheEntry` shape and semantics.
- `bootstrapCache` keyed by `tenantId`, populated once per invocation.
- 401 → `{ ok: false, transient: false, errorCode: 'auth_expired' }` on every downstream fetch.
- Non-401 provision failure → `provision_failed` transient; non-401 verify failure → `verify_failed` transient.
- All other functions (`processItem`, `ensureRepair`, `record`, etc.) and callers.
- No schema, RLS, or migration changes.

### Files
- `supabase/functions/bulk-generate-documents-worker/index.ts` — rewrite the body of `ensureSharepoint` (approx. lines 143–221).

### Verification (post-implementation)
- Deploy is automatic. Confirm with an isolated `curl` of `check-tenant-sharepoint-liveness` for a known tenant, then run a targeted bulk-generate job whose tenant has a governance folder deleted in SharePoint — the worker should now call `verify-compliance-folder` instead of skipping, and delivery should succeed on retry.
