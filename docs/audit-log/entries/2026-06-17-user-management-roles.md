# Audit: 2026-06-17 — user-management-roles

**Trigger:** ad-hoc — user management role display and invite flow gaps discovered
during investigation of Mandrie Danwatta's "Never signed in" status on Australian
College's client portal Users page.
**Scope:** three frontend-only changes (no DB migrations): `TenantUsersTab` query fix;
client portal invite flow extended to include `user` role; inline role switcher on
client portal Users page.

## Findings

- `TenantUsersTab.tsx` fetched `tenant_users` but omitted `relationship_role` from the
  SELECT. The `getMemberRelationshipRole()` helper correctly prefers
  `m.relationship_role` when present but always received `undefined`, causing the
  fallback to return `'user'` for every non-primary/non-secondary user — including
  `academy_user` members. The admin dropdown showed "User" for academy-only users,
  making it impossible to see or change their real role. Fix: add `relationship_role`
  to the query.

- Client portal invite flow (`InviteUserDialog.tsx` + `useInviteMutations.ts` +
  `invite-user` edge function) only allowed `academy_user` and `secondary_contact`
  from the client portal. Primary/secondary contacts had no way to invite a full-access
  `user` without going through Vivacity staff. Fix: add `user` as a third option.
  Confirmed full invite chain for `user` role: `ROLE_MAP → relationship_role='user'` →
  `invite-user` stores in `user_invitations` → `accept_invitation_v2` maps
  `user → access_scope='full', tm_status='active'`. No academy scoping anywhere.
  Secondary contact filter logic (removes the option once one exists) preserved.

- Client portal Users page had no way for primary/secondary contacts to change an
  existing user's role between `academy_user` and `user`. Added an inline `RoleSwitcher`
  component (compact shadcn Select, `h-8 w-[150px]`) in the desktop Role column for
  eligible rows (`row_type='active'` AND `relationship_role IN ('academy_user','user')`).
  Calls `set_relationship_role` RPC (already authorises primary/secondary contacts),
  disables only the changing row's selector during the RPC, invalidates
  `["client_tenant_users", activeTenantId]` on success. No capacity recheck needed —
  both roles count equally toward the seat limit.

- `set_relationship_role` propagation verified: updates `tenant_users`,
  `users`, and `tenant_members` atomically; RLS (`has_tenant_access_safe`) re-evaluates
  per API call so access changes take effect immediately on the changed user's next
  request; admin `TenantUsersTab` reflects on next fetch; `useClientTenant` context
  not affected (neither `academy_user` nor `user` can manage users, so
  `canManagePortalUsers` doesn't change from this switcher).

- `activate-ghost-user` edge function confirmed correct at step 8: reads existing
  `relationship_role` from `tenant_users` first, correctly maps `academy_user →
  access_scope='academy_only'` and `user → access_scope='full'` before upserting.
  The 2026-06-05 open item about ghost activation role mapping is resolved in current
  code.

## KB changes shipped

- No KB changes this session.

## Codebase observations

- unicorn @ `d9e1cf3f` (origin/HEAD):
  - `02b1af25`: `TenantUsersTab.tsx` — `relationship_role` added to `tenant_users`
    SELECT (1-line fix)
  - `9c2dc9e3`: `InviteUserDialog.tsx` + `useInviteMutations.ts` + `invite-user/index.ts`
    — `user` role option added to client portal invite; allowed array extended to
    `['academy_user','secondary_contact','user']`
  - `d9e1cf3f`: `ClientUsersPage.tsx` — `RoleSwitcher` component added; per-row
    pending state; success invalidation; error toast
- No migrations in this session. All changes are frontend + edge function only.

## Decisions

- Client portal can now invite three types: Academy only, Secondary contact, Full access
  (User) — all subject to the seat cap from yesterday's capacity feature.
- Role switcher on client portal is desktop-only; mobile `RolePill` in `UserCell` stays
  read-only to avoid duplication.
- Role switcher value is controlled by `row.relationship_role` from the refetched data —
  no optimistic update needed; failed mutation naturally reverts to the old value.

## Open questions parked

- `TenantUsersTab` still does not fetch `access_scope` from `tenant_users` — not
  currently displayed in the admin UI. Low priority since `relationship_role` is now
  shown and is sufficient.
- D/E edge function smoke test for capacity limits (from yesterday) still pending manual
  UI verification against Test RTO A/B (3/5 users — 2 invites away from cap).

## Tag
audit-2026-06-17-user-management-roles
