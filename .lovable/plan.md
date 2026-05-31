# Fix: allow Risks & Opportunities without a tenant

## Root cause

Two layered blockers:

1. **DB**: `public.eos_issues.tenant_id` is `bigint NOT NULL`.
2. **Client**: `src/hooks/useRisksOpportunities.tsx` → `createItem` resolves `tenant_id` from the user's profile (with a meeting fallback) and throws `Unable to determine tenant for this issue. Please reload and try again.` when both are null. The current Vivacity staff user has `profile.tenant_id = null`, so the insert never fires.

RLS is already permissive for Vivacity team (`eos_issues_vivacity_insert` / `eos_issues_select` / `..._update` / `..._delete` don't require `tenant_id`), so no policy changes are needed.

## Changes

### 1. Migration — `public.eos_issues.tenant_id` becomes nullable
```sql
ALTER TABLE public.eos_issues ALTER COLUMN tenant_id DROP NOT NULL;
```
No other schema, grant, RLS, trigger, or index change. Existing rows keep their `tenant_id`; only new global rows can store `NULL`.

### 2. `src/hooks/useRisksOpportunities.tsx` — `createItem`
- Remove the "resolve tenant from meeting" lookup and the `Unable to determine tenant…` throw.
- Insert `tenant_id: profile?.tenant_id ?? null`, so:
  - Vivacity staff (no `tenant_id`) create global, tenant-less items.
  - Client users continue to create items scoped to their tenant.
- Leave everything else (status default, `created_by`, source, meeting linkage, etc.) untouched.

### 3. Read path — no change required
`useRisksOpportunities` list query already shows all rows to Vivacity team / SuperAdmin and filters by `tenant_id` for client users. Tenant-less rows correctly remain invisible to client tenants and visible to staff.

## Out of scope

- No edits to RLS policies, grants, triggers, or other tables.
- No UI changes to the Add/Edit dialog (tenant is not a form field).
- `meeting-issues` / `eos-issues` hooks unaffected.

## Verification

After migration + code edit:
1. As Vivacity staff with no `profile.tenant_id`, open **EOS → Risks & Opportunities → Add Item**, submit — should create successfully and appear in the list.
2. As a client user, creating a Risk still attaches their `tenant_id` and remains visible only within their tenant.
3. Existing Close/transition fix from the previous turn still works.
