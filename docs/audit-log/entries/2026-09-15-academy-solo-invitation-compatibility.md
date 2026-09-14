# Academy Solo invitation compatibility and account-surface decision

- **Date:** 2026-09-15
- **Author:** Codex
- **Status:** verified in allowlisted `unicorn-qa`; broader controlled-pilot gates remain open
- **Scope:** Academy Solo invitation acceptance, invitation presentation, and cross-initiative account-surface contract
- **Source:** first authenticated `unicorn-qa` browser verification, current repository role/relationship helpers, Academy Solo implementation packet, and the product decision recorded in this task

## Finding

The first Academy Solo invite acceptance reached the database but failed when
`accept_invitation_v2` attempted to write `unicorn_role = 'Academy User'`.
That value is not present in `public.dd_unicorn_roles`. The existing role model
already treats `academy_user` and `academy_only` as the relationship and access
authorities while mapping the legacy `unicorn_role` to `User`.

The same browser verification found that the invitation page presented an
Academy learner as a generic Client user and used RTO-specific labels. The
initial attempt to harden the RPC by removing anonymous execution then exposed
that the supported fresh-signup path can have no session at the moment the
client finalizes the invitation. The final QA migration restores anonymous
execution but binds a no-session call to the auth user whose email matches the
pending invitation. The page also finalizes a matching existing session
directly. QA blocked repeated fresh-identity signup attempts with Supabase
Auth email rate limiting, and the QA Academy catalogue had no published
courses; those remain environment/data readiness limits.

## Corrective decision

- Write the valid legacy `User` value for `public.users.unicorn_role` when
  accepting an `academy_user` invitation.
- Preserve `tenant_users.relationship_role = 'academy_user'`,
  `tenant_users.access_scope = 'academy_only'`, and inactive legacy
  `tenant_members` status.
- Contextualise Academy Solo invitation UI as Vivacity Academy while leaving
  ordinary RTO invitation copy unchanged.
- Return `relationship_role` from token validation so the public invitation
  page can determine Academy context without an anonymous tenant read.
- Preserve the no-session signup path while binding anonymous acceptance to the
  invited email's `auth.users` identity; matching existing sessions finalize
  directly without re-running sign-up.
- Do not attach a Sidekick package. Academy metadata, access scope, lifecycle,
  and audit events are the current authorities; a future analytics entitlement
  model requires a separate product/schema decision.
- Keep Academy Customers as the lifecycle system of record. Manage Clients may
  show a clearly labelled Academy Solo account for staff visibility, but must
  not expose or imply RTO package, invoice, CSC, compliance-stage, or Client
  Health semantics for that row.

## Changes prepared

- `supabase/migrations/20260914230604_academy_solo_invitation_role_compatibility.sql`
  replaces the current `accept_invitation_v2` definition with the single role
  compatibility correction while preserving the latest identity-binding,
  contact-archival, tenant-membership, and audit behavior.
- `supabase/migrations/20260915010000_academy_solo_invitation_rpc_grant_hardening.sql`
  records the reviewed grant boundary, and
  `20260915030000_academy_solo_invitation_anonymous_identity_binding.sql`
  restores the required anonymous execution with an invited-email identity
  binding. `20260915020000_academy_solo_invitation_validation_context.sql`
  returns the relationship context used by the invitation UI.
- `src/pages/AcceptInvitation.tsx` detects the Academy Solo tenant marker and
  uses Vivacity Academy copy and field labels for that invitation only; it
  finalizes a matching authenticated session without re-running sign-up.
- `docs/kb/reference/academy-solo/phase-1/academy-solo-mvp-implementation-packet.md`
  records the finding, the no-package decision, the Manage Clients boundary,
  and the QA readiness limits.
- The Program Index and all four initiative master plans now link the
  cross-initiative dependency: existing role vocabulary for RBAC, bounded
  route/test discipline for Codebase Optimization, a distinct tenant-backed
  account surface for Tenant Operating Model, and exclusion from Client Health
  subjects unless a future analytics entitlement is approved.

## Verification and release boundary

Required before the controlled pilot is called ready:

1. Apply the migration only to the allowlisted `unicorn-qa` project. **Done.**
2. Verify the live function definition and run the authenticated invitation
   acceptance path with a run-scoped QA fixture. **Done:** browser reached
   `/academy` and showed the Academy welcome message.
3. Confirm the resulting user has legacy role `User`, relationship role
   `academy_user`, `academy_only` access, and no Sidekick/package or RTO
   side effect. **Done:** QA SQL confirmed the profile, memberships, and zero
   package instances.
4. Run frontend, Edge, typecheck, lint-ratchet, build, and KB-link checks.
   **Done:** frontend 74 files / 580 passing tests; Edge 305 passing tests;
   typecheck, build, lint-ratchet, and KB-link checks passed.
5. Record the Auth email-rate-limit and empty-course-catalogue limitations in
   the final QA evidence rather than masking them. **Done.**

The temporary QA fixture was then closed down without deleting referenced audit
history: its invitation and memberships were removed, the learner profile was
disabled, the tenant was disabled, and the tenant has zero package instances.
Production was not changed.
No production migration, invitation, account, or learner data is authorised by
this entry.
