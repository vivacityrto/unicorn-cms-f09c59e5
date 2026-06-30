# Bulk CSC / Consultant Reassignment Tool

Implements a permanent admin page that reassigns a CSC's clients to another CSC, writing atomically to both `tenant_csc_assignments` and `tenants.assigned_consultant_user_id` (the capacity column), plus a one-time backfill of the 2 known drifted rows.

## 1. Migration — `backfill_assigned_consultant_from_csc_primary`

Guarded one-time data correction (not a schema change, but run via migration tool for auditability).

- `DO $$ ... $$` guard: count tenants where `assigned_consultant_user_id IS NOT NULL` and disagrees with the current `is_primary = true` row in `tenant_csc_assignments`. Raise and abort if count ≠ 2.
- `UPDATE tenants` to align `assigned_consultant_user_id` with the primary CSC for those rows only.
- Insert one `client_audit_log` row per corrected tenant: `action = 'consultant_field_backfill'`, with `before_data`/`after_data` capturing old vs new `assigned_consultant_user_id`.

No schema, RLS, grants, or triggers touched.

## 2. Edge Function — `bulk-reassign-team-member`

New function at `supabase/functions/bulk-reassign-team-member/index.ts`. Uses service role internally; validates caller JWT.

**Input**
```json
{ "from_user_id": "uuid", "to_user_id": "uuid", "tenant_ids": [bigint, ...], "role_scope": "primary_csc" }
```

**Validation (in order, short-circuit on failure)**
1. Caller authenticated; `users.unicorn_role` is `Super Admin` or `Team Leader` (mirrors existing RBAC helpers — does not introduce a parallel permission system).
2. `from_user_id` and `to_user_id` both exist in `users`, `is_csc = true`, `archived = false`, `disabled = false`. `from != to`.
3. `tenant_ids` non-empty array. For each, look up its current primary CSC row; any tenant whose primary CSC is not `from_user_id` is dropped into `skipped[]` with a reason, never errored.

**Writes (single transaction via a SECURITY DEFINER RPC `bulk_reassign_primary_csc`)**

I'll add the RPC in the same migration as step 1 (or a sibling migration) so the function body stays thin:
- `UPDATE tenant_csc_assignments SET csc_user_id = to, assigned_since = now(), updated_at = now() WHERE tenant_id = ANY($tenants) AND csc_user_id = from AND is_primary = true`
- `UPDATE tenants SET assigned_consultant_user_id = to WHERE id = ANY($tenants) AND assigned_consultant_user_id = from` — only touches rows where the legacy column already matched `from`; pre-existing drift is left alone.
- One `client_audit_log` insert per reassigned tenant: `action = 'bulk_csc_reassignment'`, `entity_type = 'tenant_csc_assignments'`, before/after include `csc_user_id` and `csc_name`.

RPC is `REVOKE EXECUTE FROM PUBLIC/anon` + `GRANT EXECUTE TO authenticated`, and re-checks the caller role server-side.

**Output**
```json
{ "reassigned": [tenant_id, ...], "skipped": [{ "tenant_id": ..., "reason": "..." }, ...] }
```

CORS headers included. `verify_jwt` left at platform default.

## 3. UI — `/administration/team-reassignment`

New page (`src/pages/admin/TeamReassignmentPage.tsx`) + route in `App.tsx`, plus a nav entry under Administration visible only to Super Admin / Team Leader.

**Components**
- `FromStaffPicker` — Select of active CSCs (`is_csc, !archived, !disabled`). Reuses the existing `users` query pattern with the `kpi_pod != 'qa'` filter already standard in the codebase.
- `ToStaffPicker` — same list, excludes the `from` selection.
- `ReassignmentReviewTable` — once `from` is chosen, fetches `tenant_csc_assignments` (primary, joined to `tenants`) for that user. Columns: checkbox (default checked), tenant name, `assigned_since`. Header shows total count + "select all / none".
- `CapacityIndicator` (for `to` user) — calls `compute_consultant_current_load` and `compute_consultant_weekly_capacity` RPCs, displays "Current load: X / Y hrs" and a projected post-reassignment figure summed from the (currently selected) tenants' `weekly_hours_required` if available; otherwise shows just current vs capacity with a note. Amber/red badge when projected > capacity.
- Confirm button: "Reassign N clients from {from} to {to}". Disabled until ≥1 row checked and `to` selected.
- On submit → `supabase.functions.invoke('bulk-reassign-team-member', ...)` with only the checked IDs.
- Result toast: success count; if `skipped[]` non-empty, render an inline alert listing skipped tenants and reasons.
- Link to `/audit?action=bulk_csc_reassignment` if that filter exists; otherwise a static note that audit rows were written.

No modal-from-client-list shortcut — this is the only entry point.

## 4. Out of scope (explicit)
- No new sync trigger between the two columns. Drift correction stays a deliberate, audited action.
- No deprecation of either field.
- No implicit "reassign everything for this user" mode in the function — UI always passes an explicit ID list.
- No writes to legacy `audit_log`.

## Verification (post-deploy)
- Run the two SELECTs from the spec: drift count = 0; spot-check a real reassignment shows both columns agree.
- Confirm `client_audit_log` rows exist for the backfill and for a test reassignment.
- Confirm capacity overload trigger (`trg_check_overload_on_assignment`) still fires when the `tenants` column changes — it should, since we update that column inside the same transaction.

## Files touched
- `supabase/migrations/*_backfill_assigned_consultant_from_csc_primary.sql` (guard + backfill + RPC + grants)
- `supabase/functions/bulk-reassign-team-member/index.ts` (new)
- `src/pages/admin/TeamReassignmentPage.tsx` (new)
- `src/components/admin/team-reassignment/*` (pickers, review table, capacity indicator)
- `src/App.tsx` (route)
- Admin nav config (one entry, role-gated)
