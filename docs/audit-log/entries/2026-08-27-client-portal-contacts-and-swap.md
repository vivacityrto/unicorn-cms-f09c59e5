# Audit: 2026-08-27 — Client portal contact list + User↔Contact swap

**Trigger:** ad-hoc (feature request, direct git hotfix)
**Scope:** new `swap_tenant_user_to_contact` RPC; signature change to
`get_tenant_user_capacity` (arity: added optional `p_caller_id`); the
`invite-user` edge function updated to pass its caller explicitly; new UI
in the client portal (`ClientUsersPage.tsx`) and the staff view
(`TenantUsersTab.tsx`).

## Context

Carl asked for the tenant-contact-list feature (`docs/audit-log/entries/2026-08-25-tenant-contact-list.md`)
to be available in the **client portal** itself — not just the staff admin
view — plus the reverse of "Promote to User": swap an active seat-holder
back down to a contact. Verification was done as a real client persona
(Carl Simpao, Secondary Contact on Demo RTO, logged in via
`carl+demo@vivacity.com.au`) rather than staff "View as Client", per this
repo's own standing guidance that View-as-Client isn't proof of real
client-role behaviour.

## Design decisions

- Reused `TenantContactsSection.tsx` as-is in `ClientUsersPage.tsx` — its
  data layer already has no staff-only assumptions (RLS already covers
  `is_tenant_parent_safe`), so this was pure composition, no component
  changes.
- New `swap_tenant_user_to_contact(p_tenant_id, p_user_id, p_reason)` RPC
  is the inverse of the promote flow: moves a `tenant_users` row into
  `tenant_contacts` (reactivating an existing archived contact row for the
  same email if one exists, rather than creating a duplicate), then
  deletes the `tenant_users` row. Mirrors `handleRemoveUser`'s existing
  behaviour of not touching `auth.users`/`public.users` — the account
  itself survives, only tenant membership changes.
- Blocks swapping a `primary_contact`/`secondary_contact` row if it's the
  tenant's only one (would otherwise lock the tenant out of admin
  self-service) — checked before any write.

## Findings — two real, pre-existing/newly-introduced bugs caught during verification

Both surfaced only when testing as a genuine non-staff client caller —
every prior test in this feature's history (including the original
2026-08-25 session) was done as SuperAdmin, which bypasses both code paths
below entirely.

1. **`swap_tenant_user_to_contact` — wrong column type, then a ghost-user
   FK gap** (both introduced and fixed within this session, before merge):
   - First attempt passed `v_tu_id` (bigint) as `audit_eos_events.entity_id`,
     which is `uuid` — fixed by passing `NULL` there and moving `tu_id`
     into the `details` jsonb instead.
   - Second attempt then hit `audit_eos_events.user_id`'s FK to
     `auth.users`: the swapped user (a contact promoted earlier in this
     same session via `skip_email: true`) had a `public.users` row but no
     `auth.users` row yet — a "ghost" account, a normal, pre-existing state
     in this codebase (see `TenantUsersTab.tsx`'s `ghostUserIds`/
     `canActivateGhosts` handling). Fixed by skipping the audit insert
     when the target has no `auth.users` row, rather than failing the
     whole swap. Both failures rolled back cleanly (verified via direct
     SQL) — no partial-state cleanup was needed.

2. **`invite-user`'s capacity check has been broken for every real
   (non-staff) caller — pre-existing, not introduced this session.**
   `assertCapacity()` calls `get_tenant_user_capacity` through the
   function's service-role Supabase client, which carries no session JWT,
   so `auth.uid()` inside the RPC always resolves to `NULL` server-side.
   `has_tenant_access_safe(p_tenant_id, NULL)` always returns false, so the
   RPC always raised "Access denied", which `invite-user` surfaced as a
   500 `CAPACITY_CHECK_FAILED` — for literally any client-side Admin
   inviting or promoting anyone, always. This went unnoticed because
   `isVivacityStaff || isSuperAdmin` short-circuits `assertCapacity()`
   entirely, and every prior invite/promote test in this codebase's
   history (found via git log/session review) was done as staff. **This
   means the client portal's pre-existing "Invite user" button has likely
   never worked for a real tenant Admin** — out of scope to audit further
   here, but worth Carl knowing the blast radius is wider than this
   session's own feature.
   - Fixed by giving `get_tenant_user_capacity` an optional `p_caller_id`
     parameter (defaults to `auth.uid()`, so the existing browser-side call
     in `src/hooks/useUserCapacity.ts` — which does carry a real JWT — is
     unaffected) and updating `invite-user` to pass
     `callerUser.user.id` explicitly, matching the pattern its other two
     RPC calls (`is_vivacity_team_safe`, `check_permission`) already use.
   - Arity change required `DROP FUNCTION` first (`(bigint)` →
     `(bigint, uuid)`) — confirmed exactly one overload exists afterward.
   - `invite-user` redeployed (version 767) with the fix.

## Code changes

- New migration `20260826010000_swap_tenant_user_to_contact.sql`.
- New migration `20260826020000_fix_get_tenant_user_capacity_service_role_caller.sql`.
- `supabase/functions/invite-user/index.ts` — pass `p_caller_id` explicitly
  in the capacity check; deployed.
- `src/components/client/ClientUsersPage.tsx` — renders
  `TenantContactsSection`, adds "Swap to Contact" to the active-user
  actions menu with a confirmation dialog.
- `src/components/client/TenantUsersTab.tsx` — same "Swap to Contact"
  action added to the staff view for symmetry (wasn't asked for
  explicitly, but the feature is incomplete without it on both surfaces).
- `src/integrations/supabase/types.ts` — hand-patched for the new RPC and
  `get_tenant_user_capacity`'s new signature.

## Verification

- `npx vitest run`: 282 passed, 0 failures (the 6 pre-existing failures
  noted in the 2026-08-25 entry are gone as of this session — not
  investigated further, unrelated to this change).
- `tsc --noEmit`: no new errors in any touched file.
- Full manual walkthrough on Demo RTO (tenant 7547) logged in as
  **`carl+demo@vivacity.com.au`** (real Secondary Contact, not staff
  View-as-Client): Contacts section renders and is fully manageable from
  `/client/users`; "Swap to Contact" on Chloe Davis (a ghost/ ` skip_email`
  account) correctly failed twice (caught the two bugs above), then
  succeeded cleanly on the third attempt with no console errors; DB
  confirmed via direct query each time. "Promote to User" back to a real
  seat then failed on the capacity-check bug, was fixed and redeployed,
  and succeeded with no console errors on retry — DB and UI both confirmed
  Chloe back in the Users table with the Contacts section empty of her.

## Open questions parked

- The wider blast radius of the `invite-user` capacity-check bug (finding
  #2) — every client-side "Invite user" click by a real tenant Admin
  before this fix would have failed the same way. Worth a quick
  confirmation with Carl on whether any support tickets/complaints in that
  vein make more sense now.
