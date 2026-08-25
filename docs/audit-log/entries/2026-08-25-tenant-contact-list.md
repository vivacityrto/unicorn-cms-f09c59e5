# Audit: 2026-08-25 — Tenant contact list + reusable contact groups

**Trigger:** ad-hoc (new feature, direct git hotfix)
**Scope:** new schema for `tenant_contacts`, `tenant_contact_groups`,
`tenant_contact_group_members`; two new RPCs; new UI on the client Users tab
and a new staff-only Administration page. Did not touch `tenant_users`,
`dd_relationship_role`, or the existing `invite-user` edge function.

## Context

Groundwork for automating event registration in Microsoft Teams. Every
tenant needs a contact list — RTO staff who are part of the client's
organisation but are not (yet) Unicorn users — distinct from
`tenant_users`. Some memberships have a seat cap
(`get_tenant_user_capacity`, driven by `packages.user_limit`), so a contact
can be "promoted" into an active seat rather than being a second parallel
identity. A separate cross-tenant Administration page combines contacts and
real users into one directory so staff can build named groups for later
bulk actions (e.g. bulk Teams registration).

## Design decisions

- `tenant_contacts` is **not** a `dd_relationship_role` value. That lookup
  encodes seat-holder roles and drives RLS/admin gating
  (`primary_contact`/`secondary_contact`/`user`/`academy_user`); a contact
  has no seat and no relationship_role until promoted. Reusing it would
  blur "has Unicorn access" with "is on file as a contact."
- Promotion is a two-step client flow, not a new server-side invite path:
  call the existing `invite-user` edge function (same as the manual "Invite
  User" dialog) with the contact's details, then call the new
  `mark_tenant_contact_promoted(p_contact_id, p_user_id)` RPC to stamp
  `promoted_to_user_id`/`promoted_at` and archive the contact row. No
  changes to `invite-user` itself, so the existing seat-limit check inside
  it applies unchanged.
- `tenant_contact_groups`/`tenant_contact_group_members` are **staff-only**
  (RLS: `is_super_admin_safe` / `is_vivacity_staff`), modeled on
  `conversation_participants`'s editable-membership-table pattern rather
  than `broadcast_recipients`'s snapshot-per-send pattern, since a group
  needs to persist and be edited over time, independent of any single send.
- `get_admin_contact_directory()` is a `SECURITY DEFINER` RPC (not a view)
  unioning `tenant_users`+`users`+`tenants` with `tenant_contacts`+`tenants`,
  gated by an explicit `RAISE EXCEPTION` for non-staff callers rather than a
  row-filtering `WHERE`, so an unauthorized call fails loudly instead of
  silently returning an empty set.

## Findings

- No existing "reusable named list of people" concept existed anywhere in
  the schema (`bulk-user-action`, `BulkInvite.tsx`, and
  `fn_preview_broadcast_recipients` all build an ad-hoc list per action,
  never persisted).
- Seat-limit enforcement lives on `packages.user_limit` via
  `get_tenant_user_capacity`, not on `tenants` — confirmed via
  `src/hooks/useUserCapacity.ts` and the RPC body; `used` already excludes
  `primary_contact`/`secondary_contact` rows, which the promote flow relies
  on implicitly (promoting to `primary_contact`/`secondary_contact` doesn't
  consume a normal seat, matching existing behaviour for those two roles).

## Code changes

- New migration `20260825060000_tenant_contacts_and_groups.sql`: 3 tables +
  RLS policies, `mark_tenant_contact_promoted`, `get_admin_contact_directory`.
- `src/integrations/supabase/types.ts` — initially hand-patched, then
  reconciled against a real `generate_typescript_types` run in a follow-up
  pass (the MCP tool was denied by the local auto-mode classifier on the
  first attempt, available on retry). Fixed real drift: `id` columns are
  `GENERATED ALWAYS AS IDENTITY`, so Insert/Update types use `id?: never`,
  not `id?: number`; also added the full `Relationships` fan-out (every view
  that also exposes `tenant_id`), matching the existing pattern for
  `tenant_users`.
- `src/components/client/TenantContactsSection.tsx` (new) — rendered inside
  `TenantUsersTab.tsx` below the existing members list.
- `src/pages/admin/ContactDirectory.tsx` (new) — routed at
  `/administration/contacts`, `requireSuperAdmin`.
- `src/components/DashboardLayout.tsx` — added "Contact Directory" to the
  staff `administrationMenuItems` sidebar section (`superAdminOnly: true`),
  next to Team Users/Tenant Users. (Initially shipped with no nav entry,
  matching `/administration/role-permissions`'s precedent; added on
  follow-up since a feature meant to be used needs to be findable.)
- Seed data: 6 `tenant_contacts` rows on Demo RTO (tenant id 7547); 3 were
  promoted during verification (Chloe Davis, Daniel Evans, Ella Fisher) and
  are now real `tenant_users` rows — Alice Nguyen, Ben Carter (active) and
  Frank Green (archived) remain as unpromoted contacts.

## Verification

- `npx vitest run`: 271 passed, 6 pre-existing failures unrelated to this
  change (documented in `AGENTS.md` as failing on a clean checkout) — same
  result before and after the follow-up fixes below.
- `tsc --noEmit`: no new errors in any file touched by this change.
- Manual browser walkthrough (Playwright MCP), first pass under a
  `http://[::1]:8080` test origin (a loopback workaround for this dev
  machine): add/edit/archive/delete a contact, build and delete a contact
  group, filter the Administration directory. "Promote to User" failed
  there on CORS — confirmed via `supabase/functions/_shared/cors.ts`
  (`LOCAL_DEV_ORIGINS` lists `localhost:8080`/`127.0.0.1:8080`, not `[::1]`)
  that this was the test origin, not the feature.
- Second pass under a real `localhost:8080` origin (fresh login) surfaced
  two real bugs, both fixed and re-verified in this same session:
  1. **`mark_tenant_contact_promoted` was never called correctly** — the
     promote handler read `data.user_id` from the `invite-user` response,
     but that function returns `user_uuid`. The RPC call went out missing
     `p_user_id` entirely, which PostgREST reports as a confusing
     "function not found" (looks like a schema-cache problem, isn't one).
     Fixed the field name in `TenantContactsSection.tsx`. Two contacts
     promoted before the fix (Daniel Evans, Ella Fisher) had their
     `tenant_contacts` row manually reconciled via `execute_sql`; a third
     (Chloe Davis) was promoted after the fix with no manual intervention
     needed, confirming the fix.
  2. **Promote's conflict error was generic** — promoting a contact to
     Primary Contact when Demo RTO already has one (James Okafor) returns
     `invite-user`'s 409 with `{code: "PRIMARY_CONTACT_TAKEN", detail: "..."}`,
     but `supabase-js`'s `functions.invoke` puts that body on
     `error.context` (a `Response`), not on `data`, for non-2xx responses —
     the promote handler's `if (error) throw error` skipped straight to a
     generic "Failed to promote contact" toast. Fixed by reading
     `error.context.json()` first. Re-tested: toast now shows the real
     reason ("This organisation already has a primary contact. Use the
     transfer flow to reassign.") and the contact correctly stays
     un-promoted.
  3. Noted, not fixed (pre-existing, separate file): `TenantInviteDialog.tsx`
     checks for error codes `PRIMARY_EXISTS`/`SECONDARY_EXISTS`, but the
     live `invite-user` function actually returns `PRIMARY_CONTACT_TAKEN`/
     `SECONDARY_CONTACT_TAKEN` — the existing manual Invite dialog has the
     same generic-message gap for this case. Out of scope for this PR.
- Sidebar nav entry click-tested: Administration → Contact Directory link
  navigates to `/administration/contacts` correctly.

## Open questions parked

- `TenantInviteDialog.tsx`'s stale `PRIMARY_EXISTS`/`SECONDARY_EXISTS` code
  check (see Verification #3 above) — a small, separate fix if anyone picks
  it up.
