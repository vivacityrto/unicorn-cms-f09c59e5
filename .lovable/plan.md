# Reroute package inserts through start_client_package + add safety-net trigger

The previous turn only added the friendly error mapping. Now do the actual reroute and add the DB safety net.

## 1. `src/components/client/AssignPackageDialog.tsx`
In `handleAssign`, replace the direct insert:

```ts
const { error } = await supabase.from('package_instances').insert({
  tenant_id: tenantId,
  package_id: parseInt(selectedPackageId),
  is_complete: false,
  start_date: new Date().toISOString().split('T')[0],
  clo_id: 0,
});
```

with:

```ts
const { error } = await supabase.rpc('start_client_package', {
  p_tenant_id: tenantId,
  p_package_id: parseInt(selectedPackageId, 10),
  p_assigned_csc_user_id: null,
});
```

Leave `if (error) throw error;`, the toast/close/onSuccess path, and the existing catch block (with the DUPLICATE_PACKAGE_TYPE mapping) untouched.

## 2. `src/components/AddTenantDialog.tsx`
Replace both `supabase.from('package_instances').insert({...})` calls:
- Primary package (~L225): `supabase.rpc('start_client_package', { p_tenant_id: newTenantId, p_package_id: parseInt(selectedPackageId, 10), p_assigned_csc_user_id: null })`
- Membership (~L244): same shape, using `selectedMembershipId`.

Preserve the existing `console.warn` / warning-toast handling around each call. `start_date`, `is_complete`, and `clo_id` are set inside the RPC and no longer need to be passed.

## 3. New migration — safety-net trigger + RPC opt-out

Create `public.seed_stage_instances_from_template()` (`SECURITY DEFINER`, `search_path=''`) fired `AFTER INSERT ... FOR EACH ROW` on `public.package_instances`:

- Returns early if `current_setting('app.skip_stage_seed', true) = 'on'`.
- Loops `package_stages` for `NEW.package_id`, skipping stages whose `stage_instances` row for this instance already exists (idempotent).
- For each new `stage_instances` row it seeds `staff_task_instances`, `client_task_instances` (with `due_date` from `due_date_offset`), `email_instances`, and `document_instances` from the templates keyed by `stage_id`.

Drop and recreate trigger `trg_seed_stage_instances` on `public.package_instances`.

Update `public.start_client_package` to add, right after the privilege guard and before `INSERT INTO public.package_instances`:

```sql
PERFORM set_config('app.skip_stage_seed', 'on', true);
```

Do not change any other logic in `start_client_package`. `set_config(..., true)` is transaction-local, so the flag will not leak.

## Notes
- Trigger uses `NOT EXISTS` per stage so it's safe on partial data.
- No RLS or grants change; the trigger runs as `SECURITY DEFINER`.
- Frontend surface stays identical apart from the two dialog call sites.
