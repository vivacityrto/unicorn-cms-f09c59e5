

## Plan: Fix audit ownership tenant_id + navigation race

### Investigation findings

Reading the **current** `useClientAudits.ts` (post-Edge-Function refactor) plus the schema:

- `client_audits` has TWO tenant columns:
  - `tenant_id` — the **owning** (auditor) tenant. RLS `billing_gate` checks this.
  - `subject_tenant_id` — the **client being audited** (the RTO).
- The current Edge Function `create-client-audit` inserts using `subject_tenant_id` from the wizard, but does **not** set `tenant_id` (or sets it from the wrong source). That's why RLS blocks the insert: the inserter (Vivacity consultant) is not a member of the subject's tenant, and `tenant_id` isn't being scoped to their own.
- The frontend `onSuccess` navigates immediately on the React Query mutation success — that part is already gated by the function returning `{ id }`, so the navigation race only exists if the function returns 200 without a real id. Worth tightening anyway.

The user's prompt template references `profiles.active_tenant_id`, but this project's identity model uses `public.users.tenant_id` (and Vivacity staff are identified via `unicorn_role` / `superadmin_level`, with their home tenant in `users.tenant_id`). I'll use the project's real schema.

### Fix (server-side, in the Edge Function)

**File:** `supabase/functions/create-client-audit/index.ts`

1. After verifying the JWT, look up the caller in `public.users` to get their **own** `tenant_id` (the auditor/owner tenant) and `unicorn_role`.
2. Authorisation (unchanged intent): allow if `unicorn_role` is set (Vivacity staff) OR caller is in `tenant_users` for `subject_tenant_id`.
3. Reject with 400 if the caller has no `users.tenant_id` (defensive — staff accounts always have a home tenant).
4. Build the insert payload with:
   - `tenant_id` = caller's `users.tenant_id` (the **auditor's** tenant — satisfies `billing_gate`)
   - `subject_tenant_id` = body.subject_tenant_id (the RTO being audited — already passed from the wizard)
   - all existing snapshot/`audit_type`/etc fields untouched
   - `created_by` = caller's `user_uuid`
5. After the service-role insert, **verify** the returned row has an `id` before doing the side-effect writes (stage_instances back-link + timeline event). If `id` is missing, return 500 with a clear error so the frontend toast fires.
6. Return `{ id }` only on confirmed success.

### Fix (client-side hardening)

**File:** `src/hooks/useClientAudits.ts`

Tighten `useCreateAudit.onSuccess` so navigation only happens when `data?.id` is a non-empty string:

```ts
onSuccess: (data) => {
  if (!data?.id) {
    toast.error('Audit created but ID not returned. Please refresh the Audits list.');
    queryClient.invalidateQueries({ queryKey: ['client-audits-dashboard'] });
    return;
  }
  queryClient.invalidateQueries({ queryKey: ['client-audits-dashboard'] });
  queryClient.invalidateQueries({ queryKey: ['client-audits'] });
  toast.success('Audit created successfully');
  navigate(`/audits/${data.id}`);
}
```

The existing `onError` already handles thrown errors from `functions.invoke` (function returns non-2xx → mutation rejects → toast fires → no navigation). No change needed there.

### Why not the prompt's exact code

- The prompt assumes a direct browser insert. We've already (correctly) moved this to an Edge Function per Framework §4 — direct inserts would re-introduce the original RLS leak path and put service-role logic considerations in the browser bundle. Keeping the fix server-side is the right shape.
- The prompt references `profiles.active_tenant_id`; this project uses `users.tenant_id`. Using the wrong table would 404.

### Files
- Edit: `supabase/functions/create-client-audit/index.ts` (resolve owner tenant_id, set both tenant columns, verify id before side-effects)
- Edit: `src/hooks/useClientAudits.ts` (`onSuccess` guard on `data.id`)

### Out of scope
- No DB schema or RLS changes — schema already has both `tenant_id` and `subject_tenant_id`; RLS is correct.
- No wizard UI changes — `subject_tenant_id` is already passed correctly from `NewAuditModal`.
- No changes to read paths.

### Acceptance
1. Vivacity consultant (e.g., on `/tenant/7532`) completes the wizard → row lands in `client_audits` with `tenant_id` = consultant's own home tenant and `subject_tenant_id` = 7532.
2. RLS `billing_gate` passes; no "violates row-level security" error.
3. Navigation to `/audits/:id` only fires when the function returns a real id.
4. Failures surface as toasts; wizard stays open; no half-created records visible as "Audit not found".

