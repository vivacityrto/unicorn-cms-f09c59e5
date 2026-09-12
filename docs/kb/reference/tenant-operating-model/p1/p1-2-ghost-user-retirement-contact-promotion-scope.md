# TOM P1.2 — ghost-user retirement and contact promotion scope

> **Last updated:** 2026-09-12 · **Status:** planning/scoping draft; lifecycle decisions closed, no implementation or production mutation authorized
> **Owner:** TOM, with RBAC and Client Health review
> **Dependencies:** TOM P0.1 owner dispositions; P1.1 membership compatibility scope; invitation/auth contract review

## Purpose

Retire the staff-facing `activate-ghost-user` workflow by correcting the
underlying identity model: a person who is known to a tenant but has not yet
created or accepted a Unicorn login is a **contact**, not an authenticated
tenant member. They should appear in the tenant contact list and become a
user only through an explicit invitation/promotion and acceptance flow.

This packet records the bounded design and evidence needed before any code,
data migration, Edge Function retirement, or live change. It does not
authorize any of those actions.

## Current truth

### Source behavior

The current staff/client tenant-users UI in `TenantUsersTab.tsx` reads
`tenant_users` joined to `public.users`, then calls `is_ghost_user` for each
row. A ghost row is a `public.users` profile with no matching `auth.users`
row. Vivacity staff receive an **Activate account** action that invokes
`activate-ghost-user`.

`activate-ghost-user` currently:

1. creates an `auth.users` row using the legacy `public.users.user_uuid`;
2. immediately upserts `tenant_users` and `tenant_members`;
3. updates the profile role/type;
4. creates a pending invitation and sends the setup email.

The result is that membership and access state exist before the person accepts
the invitation. `has_tenant_access_safe()` grants access from an active
`tenant_members` row. This is the wrong lifecycle for a person who has not
opted into an account.

The existing contact promotion path is already closer to the target:
`promoteContactViaInvite()` calls `invite-user` with `skip_email: false`.
That path creates a pending `user_invitations` row, while
`accept_invitation_v2` materializes `public.users`, `tenant_users`, and
`tenant_members` when the recipient accepts.

### Live evidence (read-only, 2026-09-12)

- `public.users`: 627 total; 411 have no matching `auth.users` row.
- `tenant_users`: 576 total; 375 rows reference profiles with no auth row.
- `tenant_members`: 936 total; 691 rows reference profiles with no auth row.
- Those 691 rows represent 356 distinct ghost profiles; 366 rows are marked
  active and 325 inactive.
- 348 distinct ghost profiles have `tenant_users` rows; 55 ghost profiles
  have neither membership table. Of those 55, 54 have no tenant association
  and 45 are archived, so they must not be bulk-converted.
- 335 of the 356 membership-bearing ghost profiles occur in two tenants;
  conversion therefore needs one contact row per `(tenant, person)` rather
  than one global contact row.
- `tenant_contacts`: 114 total, 105 active, 9 archived, 2 marked promoted.
- Six active contact rows currently match a pending invitation by tenant and
  email, so the current promotion flow can show a person in both Contacts and
  Users while the invitation is pending.
- No active contact currently matches a ghost profile by tenant and email,
  so a dry-run conversion can detect collisions before writing.

The live `tenant_members` foreign key points to `public.users(user_uuid)`, not
`auth.users(id)`. Therefore “ghost tenant member” is not a missing profile;
it is a profile/member record without a login identity. The schema currently
allows this state, while access helpers only become usable once an auth row
exists.

## Target semantic split

| State | Canonical records | Seat/access meaning | User action |
| --- | --- | --- | --- |
| Contact | `tenant_contacts` | no seat, no login, no tenant access | edit, archive, or promote |
| Invitation pending | `tenant_contacts` plus `user_invitations` (or one clearly defined pending projection) | invitation may reserve a seat; no authenticated access | recipient accepts or invitation is cancelled/expired |
| Authenticated tenant user | `auth.users`, `public.users`, `tenant_users`, `tenant_members` | seat and access according to accepted relationship role | normal user lifecycle |

`tenant_members` remains the canonical access ledger for authenticated users,
consistent with the approved TOM P0.1 direction. It should not be the place
where a pre-login contact is treated as an active member.

## Required implementation boundaries

### 1. Replace activation entry points

- Remove the `Activate account` action and ghost-specific bulk activation
  controls from `TenantUsersTab.tsx` only after the conversion/read path is
  ready, so existing people are not stranded in a user-only list.
- Remove the activation branch from `bulk-account-actions` and the cohort
  sender worker only after their callers and operational jobs are drained or
  explicitly retired.
- Keep `activate-ghost-user` deployed until the migration, replacement flow,
  and zero-caller evidence are complete. Deleting the Edge Function is a
  separate production action.

### 2. Make the contact list the pre-user surface

- Convert membership-bearing ghosts to contact projections using one row per
  tenant and lower-cased email collision checks.
- Preserve name, email, phone/job title where available, position type, and
  source UUID/relationship metadata in a migration/audit record. Do not give a
  contact a relationship role or access scope before promotion.
- Exclude membershipless ghosts from bulk conversion; route them to a manual
  disposition because almost all have no tenant association.
- Make the Contacts UI filter `status = 'active' AND promoted_to_user_id IS
  NULL`; the current filter only checks `promoted_to_user_id`, so archived
  contacts remain visible.

### 3. Make acceptance the materialization boundary

- Keep `promoteContactViaInvite()` on the standard real-email invitation path.
- At invitation acceptance, `accept_invitation_v2` must create/relink the
  profile and create/update `tenant_users` and `tenant_members` atomically.
- Define one pending-promotion presentation: either keep the contact visible
  with an explicit pending state and disable duplicate promotion, or archive
  it at invitation send and retain a reliable invitation/contact link for
  cancellation, expiry, and reactivation. Do not leave the current ambiguous
  duplicate state undocumented.
- Review the unused `mark_tenant_contact_promoted` RPC. It exists in the
  contact migration history but has no source caller; it must either become
  part of the chosen pending-state contract or be retired as dead compatibility
  surface in a separate bounded change.

### 4. Preserve data and rollback

The data step must be staged and idempotent:

1. produce a dry-run report of ghost `(tenant, email)` candidates, collisions,
   membership roles/statuses, and membershipless profiles;
2. insert/verify contact projections without deleting source records;
3. switch reads and invitation/promotion behavior;
4. observe parity and failed-promotion/cancellation/acceptance outcomes;
5. only then deactivate legacy ghost membership rows through an explicitly
   authorized migration, with a tested rollback path.

The migration must not delete `public.users`, `auth.users`, or historical
membership/audit data as a convenience. Existing ghost profiles may be needed
by `accept_invitation_v2`'s email-based relink behavior, and downstream tables
have foreign-key dependencies. Any eventual archival/deletion needs its own
blast-radius review.

## Verification and exit gates

Before implementation is presented as ready:

- characterization tests cover contact creation, promotion, invitation
  pending, acceptance, cancellation/expiry, and authorization failures;
- the real invitation acceptance path is proven to create the three user
  records exactly once and archive/link the contact exactly once;
- no active contact and pending invitation can silently create duplicate
  promotion actions;
- no pre-acceptance row grants tenant access through `tenant_members`;
- capacity semantics are explicit: contacts do not consume a seat, while a
  pending promotion may consume one if that remains the product decision;
- all callers of `activate-ghost-user`, including bulk and cohort workers, are
  accounted for;
- dry-run counts reconcile before and after the read switch;
- rollback restores the prior read path without deleting source identity data;
- RBAC verifies that contact visibility/edit/promotion uses tenant-admin
  policy, while accepted access uses the approved capability/tenant model;
- production migration, Edge deployment/deletion, and any data backfill have
  separate authorization and audit records.

## Resolved lifecycle decisions (2026-09-12)

The five product/lifecycle questions previously listed here are closed for
the next packet boundary:

1. A pending promotion remains visible in Contacts with an explicit
   `Pending invitation` state and duplicate promotion disabled.
2. A pending promotion reserves a seat immediately; a plain contact does not.
3. The legacy `public.users` ghost profile is retained until acceptance/relink
   and audit reconciliation are complete.
4. Source UUID, role, relationship, status, and other relevant historical
   metadata remain reportable in a migration/audit record; a pre-login contact
   receives no relationship role or access scope.
5. The 55 membershipless ghosts are quarantined for manual review and are not
   automatically converted.

The read-only execution contract for these decisions is defined in [TOM
P1.2-a — ghost-to-contact dry-run evidence packet](p1-2-a-ghost-contact-dry-run-evidence-packet.md).
Implementation, production backfill, and legacy activation retirement remain
separately gated.

## Evidence references

- `src/components/client/TenantUsersTab.tsx` — ghost detection, activation,
  direct `tenant_users` read, and user-only rendering.
- `src/components/client/TenantContactsSection.tsx` — contact CRUD,
  promotion UI, and current active-contact filter.
- `src/features/client-identity/promoteContact.ts` — standard invitation
  promotion adapter.
- `supabase/functions/activate-ghost-user/index.ts` — current legacy flow.
- `supabase/functions/invite-user/index.ts` — standard invitation and direct
  skip-email flows.
- `supabase/migrations/20260825060000_tenant_contacts_and_groups.sql` —
  contact schema and historical promotion RPC.
- `supabase/migrations/20260826010000_swap_tenant_user_to_contact.sql` —
  user-to-contact transition contract.
- `supabase/migrations/20260827010000_accept_invitation_archives_matching_contact.sql` —
  acceptance-time contact archival/linking.
- `docs/audit-log/entries/2026-05-26-bug-041-ghost-user-role-fix-and-activation.md`
  and `2026-06-05-role-backfill-primary-secondary-contacts.md` — historical
  ghost scope and activation/role lifecycle findings.
- `docs/kb/reference/tenant-operating-model/p1/p1-1-membership-ownership-compatibility-scope.md`
  — approved compatibility, shadow, rollback, and parity gates.
