

## Plan: Fix audit creation + detail (real root cause — not `audit_runs`)

### Reality check on the user's prompt

The prompt asserts `public.audit_runs` exists and the codebase queries it. **Both are false.** I verified directly:

- `public.audit_runs` does NOT exist. The actual tables are `client_audits`, `client_audit_findings`, `client_audit_actions` — already correctly used by the frontend (`useAudit`, `useClientAudits`, `useAuditFindings`, etc.).
- No Postgres logs reference `audit_runs` or "relation does not exist".
- No edge-function logs exist for `create-client-audit` (it has never executed successfully — the deployment may be failing, or it's failing silently before logging).

So we will **not** create or rename anything to `audit_runs`. Doing so would break the entire audit module that already works against `client_audits`.

### Actual root cause of "Audit not found" + create failures

The **previous fix** to the edge function added `tenant_id: ownerTenantId` to the insert. But `client_audits` has **no `tenant_id` column** — only `subject_tenant_id`. Confirmed via `information_schema`:

```
client_audits columns: id, audit_type, subject_tenant_id, title,
snapshot_*, lead_auditor_id, ..., created_by, created_at, ...
(no tenant_id column anywhere)
```

So every call to `create-client-audit` now fails with a Postgres "column tenant_id does not exist" error. The mutation rejects, no row is created, and any audit the user thinks they created never existed → detail page shows "Audit not found".

The earlier RLS-violation theory was also misdiagnosed. The **only** RLS policy on `client_audits` is `client_audits_tenant_read` (SELECT, USING tenant_members membership on `subject_tenant_id`) — there is **no INSERT policy with a billing_gate**. The original direct-browser insert failed simply because there's no INSERT policy at all. Service-role insert from the edge function is the right path; we just need to stop writing to a phantom column.

A secondary issue: the auth check uses `tenant_users`, but the read RLS policy uses `tenant_members`. Both tables exist. For staff (Vivacity consultants), `unicorn_role` is set so they pass authorization regardless — fine. For non-staff users we should align with the table the rest of the app treats as source of truth (`tenant_users` per project memory). Keep `tenant_users`. No change needed.

### Fix

**File:** `supabase/functions/create-client-audit/index.ts`

1. Remove the `tenant_id: ownerTenantId` line from the insert payload (column doesn't exist).
2. Remove the now-unused `ownerTenantId` resolution and the 400 guard for missing home tenant. Keep the `users` lookup only for `unicorn_role` (staff check).
3. Everything else (auth, side-effects, response shape) stays identical — it's already correct.

**File:** `src/hooks/useClientAudits.ts`

No change. `useAudit` already queries `client_audits` correctly via `.from('client_audits' as any).select('*').eq('id', auditId).single()`. The "Audit not found" was purely a downstream symptom of the failed insert.

### Why we ignore the rest of the user's prompt

- "Query `audit_runs`" → would 404 against a non-existent table. We keep `client_audits`.
- "Add `audit_findings(count)` / `audit_tasks(count)` to the detail query" → those tables don't exist either; the code already uses dedicated hooks (`useAuditFindings`, `useAuditActions`) against `client_audit_findings` / `client_audit_actions` and computes counts in JS.
- "Confirm Create Audit calls the Edge Function" → already true (last fix). Navigation guard on `data?.id` is also already in place.

### Files changed
- Edit: `supabase/functions/create-client-audit/index.ts` — drop the phantom `tenant_id` field from the insert and the related guard.

### Out of scope
- No DB migrations. Schema is correct as-is.
- No frontend changes. Reads, navigation guard, mutation wiring are all already correct.
- No RLS changes.

### Acceptance
1. Vivacity consultant on `/tenant/7532` completes the wizard → row inserts into `client_audits` with `subject_tenant_id = 7532` and no column errors.
2. Edge function returns `{ id }`; frontend navigates to `/audits/:id`.
3. `useAudit` loads the row → workspace renders (no "Audit not found").
4. Findings/Actions counters render as 0 for a fresh audit.

