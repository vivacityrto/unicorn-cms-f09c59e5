## Fix shared-folder `force` flag in `ensureSharepoint()`

In `supabase/functions/bulk-generate-documents-worker/index.ts`, the shared-folder branch of `ensureSharepoint()` currently only sets `force: true` when `shared === 'missing'`, omitting it for `shared === 'unconfigured'`.

That's incorrect: `provision-tenant-sharepoint-folder`'s idempotency short-circuit only checks `provisioning_status === 'success'` + `root_item_id`, not `shared_folder_item_id`. A tenant that has `provisioning_status = 'success'` and a `root_item_id` but a missing `shared_folder_item_id` — a real existing state — gets `already_provisioned: true` back without `force`, and `shared_folder_item_id` never gets populated. The liveness check keeps returning `'unconfigured'`, and `deliver-governance-document` keeps failing with `SHARED_FOLDER_MISSING`.

### Change

In the shared-folder branch, always pass `force: true` for both `'missing'` and `'unconfigured'`:

```ts
if (shared === 'missing' || shared === 'unconfigured') {
  const body: Record<string, unknown> = { tenant_id: tenantId, force: true };
  // ...rest of the existing POST + response handling unchanged
}
```

Remove the conditional `if (shared === 'missing') body.force = true;` line.

### Why this is safe

`provision-tenant-sharepoint-folder`'s `force` path re-runs folder creation through the same idempotent `ensureFolder` helper: on a 409-already-exists, it fetches and reuses the existing item rather than duplicating. Forcing on a tenant whose root folder still exists in SharePoint just fills in whatever's missing downstream (including `shared_folder_item_id`) without creating duplicates.

### Unchanged

- Governance branch (`verify-compliance-folder` on `'missing'`/`'unconfigured'`).
- `BootstrapCacheEntry` shape and caching semantics.
- 401 → `auth_expired`; non-401 provision failure → `provision_failed` transient.
- Liveness-call error handling and `liveness_check_failed` / `settings_read_failed` classifications.
- All other functions and callers.

No schema, RLS, or migration changes.

### Files

- `supabase/functions/bulk-generate-documents-worker/index.ts` — one-line change inside `ensureSharepoint()`'s shared-folder branch.
