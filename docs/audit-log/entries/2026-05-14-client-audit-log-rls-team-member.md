# Audit: 2026-05-14 — client_audit_log RLS Team Member fix

**Trigger:** Lovable production DB change session — `client_audit_log` INSERT and SELECT policies excluded `Team Member` role, causing silent RLS denials for ~31 frontend call sites running as non-Super-Admin Vivacity staff.
**Author:** Carl
**Scope:** Supabase project `yxkgdalkbrriasiyyrwk`. Two RLS policies replaced. No schema, data, or other object changes.

---

## Background

Investigation of "Plan B" from the `addin_audit_log` session (2026-05-14). The original hypothesis was that tenant users were silently failing to write to `client_audit_log`. The actual root cause was different: the two RLS policies used a manual `unicorn_role` check that omitted `Team Member`.

The canonical staff-access function `is_vivacity_team_safe()` covers `Super Admin`, `Team Leader`, and `Team Member`. Every adjacent table in the RTO audit module (`client_audit_actions`, `client_audit_findings`, `client_audit_responses`, `client_audit_sections`, `client_audits`) uses this function. `client_audit_log` alone used a manual check — almost certainly an oversight when the policies were written.

---

## Root cause

```sql
-- Before (manual check — omits Team Member)
WITH CHECK (EXISTS (
  SELECT 1 FROM users
  WHERE user_uuid = auth.uid()
  AND unicorn_role IN ('Super Admin', 'Team Leader')
))
```

`Team Member` is a valid `unicorn_role` enum value and is the role assigned to active Vivacity consultants. No users currently hold `Team Leader`. Result: only Super Admins could INSERT or SELECT — all other Vivacity staff were silently denied.

---

## DB changes shipped

Single migration applied to `yxkgdalkbrriasiyyrwk`:

| Policy | Before | After |
|---|---|---|
| `client_audit_log_superadmin_insert` | `unicorn_role IN ('Super Admin', 'Team Leader')` | `is_vivacity_team_safe((SELECT auth.uid()))` |
| `client_audit_log_superadmin_select` | `unicorn_role IN ('Super Admin', 'Team Leader')` | `is_vivacity_team_safe((SELECT auth.uid()))` |

`is_vivacity_team_safe()` definition (unchanged):
```sql
SELECT EXISTS (
  SELECT 1 FROM public.users
  WHERE user_uuid = p_user_id
    AND unicorn_role IN ('Super Admin', 'Team Leader', 'Team Member')
);
```

Policy names retained. No UPDATE/DELETE policies added — table remains append-only.

---

## Verification

Post-migration assertions confirmed:
- Both policies use `is_vivacity_team_safe` in their definition ✅
- Team Member access to INSERT and SELECT restored ✅
- Super Admin and Team Leader access unchanged ✅

---

## KB changes shipped

None. `is_vivacity_team_safe` convention is already documented in `unicorn-kb/pinned/conventions.md`.

---

## Codebase observations (read-only)

- `unicorn-cms-f09c59e5 @ a171ca97`: 31 frontend INSERT call sites for `client_audit_log` now unblocked for Team Member users. No code changes required — the fix is entirely at the RLS layer.
- The two edge functions flagged as user-JWT callers (`delete-incomplete-audit`, `send-composed-email`) remain deferred — separate session if needed.

---

## Decisions

- **No tenant-user INSERT policy added**: `client_audit_log` records Vivacity staff actions on client workspaces. Client users (`User`, `Academy User` roles) do not need write access. Staff-only posture maintained.
- **Policy names retained**: `client_audit_log_superadmin_insert` / `client_audit_log_superadmin_select` — names are slightly misleading now (they cover all staff, not just Super Admin) but changing them would be unnecessary churn. Acceptable.

---

## Open questions parked

- `client_audit_log` has no FK from `tenant_id` to `tenants(id)` — noted in the audit, deferred.
- `delete-incomplete-audit` and `send-composed-email` edge functions use user JWT and are subject to RLS — if non-staff users trigger those flows they may still fail. Deferred.

---

## Tag

`audit-2026-05-14-client-audit-log-rls-team-member`
