# Post-Launch Follow-Up Backlog Update

Per your direction, no RBAC refactor this turn. Just appending the agreed follow-ups to `.lovable/backlog.md` so they're tracked alongside the existing items.

## Decision Recap (for the record)

- **Q1 (Angela's role)**: Confirmed — `+bulktest1@vivacity.com.au` has `unicorn_role = 'Admin'`, not Vivacity team.
- **Q2 (sidebar source of truth)**: Defer the structured-fields refactor. When shipped, gate must be `is_team === true OR unicorn_role IN ('Super Admin','Team Leader','Team Member')` until backfill completes — Angela's main account (`is_team = false`, `unicorn_role = 'Super Admin'`) is the canary that would lose her own sidebar under an `is_team`-only gate.

## Items to Append to `.lovable/backlog.md`

### 6. Override Modal — Email Format Validation
**Priority:** Medium
**Description:** Add email format validation to the override modal (carried over from earlier session).

### 7. RBAC — Load Structured Fields into Auth Profile
**Files:** `src/hooks/useAuth.tsx`, `src/components/layout/AuthenticatedLayout.tsx`, `src/components/DashboardLayout.tsx`, `src/contexts/TenantTypeContext.tsx`
**Priority:** Medium
**Description:** Extend `UserProfile` interface and `fetchUserProfile` select to include `is_team` and `user_type`. Migrate the three sidebar-decision sites to:
```ts
const isVivacityTeam =
  profile?.is_team === true ||
  ['Super Admin', 'Team Leader', 'Team Member'].includes(profile?.unicorn_role || '');
```
Once the `is_team` backfill (item 9) is complete and verified across all staff accounts, tighten to `is_team === true` alone. Requires regression pass on every `unicorn_role`-gated screen.

### 8. Backfill `is_team = true` for Angela's Main Account
**Priority:** High (do before item 7 ships)
**Description:** Migration:
```sql
UPDATE public.users SET is_team = true
WHERE email = 'angela@vivacity.com.au';
```
Broaden to all staff with `user_type = 'Vivacity Team'` AND `is_team = false` once item 9 root cause is understood.

### 9. Investigate `is_team` Trigger Gap on Legacy Accounts
**Priority:** Medium
**Description:** Angela's account has `user_type = 'Vivacity Team'` but `is_team = false`. Determine whether:
  (a) the trigger that sets `is_team` from `user_type` doesn't exist,
  (b) it exists but only fires on INSERT (not retroactive for accounts predating it), or
  (c) it was added after Angela's account was provisioned.
Audit all `users` rows where `user_type = 'Vivacity Team' AND is_team = false` and either backfill or add a one-time reconciliation migration.

## Files Changed

- `.lovable/backlog.md` — append items 6–9 and update the summary table + last-updated date.

## Out of Scope (this turn)

- No changes to `useAuth.tsx`, sidebar layout components, or `TenantTypeContext`.
- No database migrations.
- No regression testing of role-gated screens.
