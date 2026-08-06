# Audit: 2026-05-08 — staff-directory-rpc-hardening

**Trigger:** Phase 2B of the client URL access audit (`audit-2026-05-08-client-url-access-audit`). `useVivacityTeamUsers` hook was querying the `users` table directly and returning `email`, `job_title`, and `unicorn_role` for all active Vivacity staff. The hook was used in client-visible components, and the raw `users` query was reachable via direct Supabase REST API calls regardless of frontend RBAC gates.
**Scope:** `useVivacityTeamUsers` hook and its consumers; two SECURITY DEFINER RPC functions created in Supabase; two duplicate raw `users` queries removed. No RLS policy changes. Does not close the direct-REST residual risk via `users_select_same_tenant` / `users_select_assigned_csc` (deferred — see Open questions).

---

## Findings

### Root cause
`useVivacityTeamUsers` selected `user_uuid, first_name, last_name, email, avatar_url, unicorn_role, job_title` from `public.users` with only client-side role filtering. Any authenticated user — including client-role Admin/User — could retrieve this data via direct REST calls to `/rest/v1/users?select=email,job_title,...`.

### Confirmed exposure
`users_select_same_tenant` allows a client tenant user to read full rows (including `email` and `job_title`) for any user sharing a `tenant_members` row with them. At time of audit: 5 active `tenant_members` rows join Vivacity staff to non-Vivacity tenants. Those 5 staff rows were readable in full by the corresponding tenant's Admin/User via direct REST.

### Duplicate raw queries
Two additional files contained local copies of the same `from('users')` query — `AuditTemplateBuilder.tsx` (line 124) and `LiveInspectionDialog.tsx` (line 80) — creating two additional PII paths.

---

## Decisions made

| Decision | Resolution |
|---|---|
| QCScheduler email send needs real staff email | Staff-only RPC (`get_vivacity_team_directory_staff`) — no edge function move |
| TeamMembersSection / SeatDetailPanel show email + job_title | Keep via staff-only RPC |
| Command/search UX uses email in search strings | Keep via staff-only RPC |
| VivacityTeamUser type name | Kept — no rename, no consumer churn |

---

## What was built

### DB objects created

| Object | Type | Behaviour |
|---|---|---|
| `public.get_vivacity_team_directory()` | SQL, STABLE, SECURITY DEFINER, search_path=public | Returns `user_uuid, first_name, last_name, avatar_url` for active non-archived Vivacity staff. No PII. Any authenticated user can call. |
| `public.get_vivacity_team_directory_staff()` | SQL, STABLE, SECURITY DEFINER, search_path=public | Returns all 7 fields including `email`, `job_title`, `unicorn_role`. `is_vivacity_team_safe(auth.uid())` in WHERE clause — non-staff callers get 0 rows, no error. |

Both: `REVOKE ALL FROM PUBLIC; GRANT EXECUTE TO authenticated`. Supabase also applies default grants to `anon` and `service_role` — `anon` is acceptable for the public variant (no PII) and harmless for the staff variant (returns 0 rows). 15 active staff rows at time of deploy.

### Frontend files changed

| File | Change |
|---|---|
| `src/hooks/useVivacityTeamUsers.tsx` | `useVivacityTeamUsers` now calls `supabase.rpc('get_vivacity_team_directory_staff')`. `VivacityTeamUser` type, query key `['vivacity-team-users']`, and `staleTime` unchanged. New `useVivacityTeamDirectory` hook added (calls public RPC, 4-field `VivacityTeamDirectoryEntry` type, not wired anywhere yet). |
| `src/pages/AuditTemplateBuilder.tsx` | Local duplicate `useVivacityTeamUsers` query deleted. Now imports shared hook. |
| `src/components/audit/LiveInspectionDialog.tsx` | Local duplicate `useVivacityTeamUsers` query deleted. Now imports shared hook. |

No RLS policies, FK constraints, or other files modified.

---

## KB changes shipped

No changes — read-only audit, all implementation via Lovable.

## Codebase observations (read-only)

- unicorn-cms-f09c59e5 @ `b0167c62` ("Switched to staff RPC") — state at sign-off.
- Migration `20260508044509` (latest at time of audit) — contains the two SECURITY DEFINER functions.

## Decisions

No ADRs. Residual RLS hardening (`users_select_same_tenant` / `users_select_assigned_csc` column-mask) deferred — see Open questions.

## Open questions parked

- **Residual direct-REST exposure:** `users_select_same_tenant` and `users_select_assigned_csc` still allow a client Admin/User to read `email` and `job_title` for Vivacity staff joined to their tenant via direct REST calls. 5 `tenant_members` rows affected at time of audit. Fix requires either a column-mask view (`users_public`) or explicit column-level REVOKE on PII columns for non-staff roles. Separate session, separate Lovable production DB change workflow.
- **`anon` grant on both RPCs:** Supabase default behaviour adds `anon` to function ACL after migrations. The staff variant is safe (0 rows for anon). The public variant leaks non-PII staff names/avatars to unauthenticated callers — acceptable given Supabase requires an API key, but worth reviewing if the app ever moves to a stricter anon posture.

## Tag

`audit-2026-05-08-staff-directory-rpc-hardening`
