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
- `src/integrations/supabase/types.ts` hand-patched for the new
  tables/functions — `generate_typescript_types` was unavailable in this
  session (denied by the local auto-mode classifier); regenerate properly
  next time the MCP tool is available and diff against this hand patch.
- `src/components/client/TenantContactsSection.tsx` (new) — rendered inside
  `TenantUsersTab.tsx` below the existing members list.
- `src/pages/admin/ContactDirectory.tsx` (new) — routed at
  `/administration/contacts`, `requireSuperAdmin`. No sidebar nav entry
  added, matching the existing precedent for `/administration/role-permissions`
  (reachable by direct URL only, not in `navigationConfig.ts`).
- Seed data: 6 `tenant_contacts` rows on Demo RTO (tenant id 7547) for
  manual/future testing — left in place.

## Verification

- `npx vitest run`: 271 passed, 6 pre-existing failures unrelated to this
  change (documented in `AGENTS.md` as failing on a clean checkout).
- `tsc --noEmit`: no new errors in any file touched by this change (repo
  baseline already has unrelated pre-existing errors elsewhere).
- Manual browser walkthrough (Playwright MCP, logged in as SuperAdmin):
  add/edit/archive/delete a contact, build and delete a contact group from
  the Administration directory, filter by client/source/status/position.
  The "Promote to User" action correctly reached `invite-user` and failed
  only on a CORS rejection tied to this session's `http://[::1]:8080` test
  origin — confirmed the pre-existing manual "Invite User" dialog hits the
  identical CORS wall from the same origin, so this is a session-environment
  artifact, not a regression. Not exercised end-to-end against a real
  `localhost` origin.

## Open questions parked

- TS types were hand-patched, not generated — verify against a real
  `generate_typescript_types` run before this drifts further.
- Promote-to-`primary_contact`/`secondary_contact` isn't blocked if that
  slot is already taken; `invite-user`'s own `PRIMARY_EXISTS`/`SECONDARY_EXISTS`
  handling covers this, but the promote dialog's error surface for that case
  wasn't exercised in this session.
