# 2026-09-15 — Academy invitation capacity and Solo reversibility

## Scope

Bounded regression correction for the Academy Solo pilot and ordinary client
invitation path. The reported failures were confirmed from repository source
and the production read-only snapshot; no production data was changed by this
PR.

## Findings

1. `invite-user` still called `get_tenant_user_capacity` with the retired
   `p_caller_id` argument. The function now has one argument and derives the
   caller from `auth.uid()`. Because invitation writes use a service-role
   client, tenant-admin capacity checks failed before an invitation could be
   created.
2. `manage_academy_solo_access` used the existence of the
   `metadata.academy_solo` key as a permanent Solo switch. After the first
   save, disabling the switch could not remove the marker or restore a prior
   multi-user cap.
3. The Academy Customers drawer observed the `tenant` query parameter but did
   not clear it on close, so a closed Manage Clients deep-link reopened.

## Correction

- Capacity reads now use a caller-scoped Supabase client with the already
  validated bearer token and the published one-argument RPC. Invitation writes
  remain service-role-backed.
- Solo enable stores the prior `academy_max_users` value in the marker;
  disabling Solo removes the marker and restores that value, with a requested
  cap fallback for older markers. The form restores the prior cap when a
  toggle is changed before saving.
- Drawer close, cancel, and successful-save paths clear the `tenant` query
  parameter.
- Manage Clients now defaults to the RTO account view; Academy Solo remains
  available through the explicit account-type filter.

## Controls and verification

The migration is allowlisted for review because its `UPDATE`/`INSERT`
statements are inside the existing staff-only audited SECURITY DEFINER RPC.
Focused edge/source contract tests cover the one-argument capacity call and
reversible SQL branches. The required lint, typecheck, frontend/edge test,
build, and authenticated browser verification are PR gates; production
deployment remains a separate release action.

## Impact boundary

No new role, package, compliance stage, Client Health metric, or RTO workflow
is introduced. Academy Solo remains a distinct tenant-backed account surface
and ordinary RTO invitation flows retain their existing role and capacity
semantics.
