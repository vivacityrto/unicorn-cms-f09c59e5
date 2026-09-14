# Academy Solo MVP server boundary and audited pilot lifecycle

- **Date:** 2026-09-14
- **Author:** Codex
- **Status:** QA and production migrations applied for controlled-pilot testing; no public launch or billing deployment
- **Scope:** Academy Solo controlled pilot implementation
- **Source:** `C:/Users/carls/.codex/.chatgpt-projects/g-p-6aa73a757abc8191971caabac7d73939/academy-solo-discovery-handoff.md`, repository Academy/RBAC/Tenant Operating Model evidence, and the Sidekick product/architecture council review

## Decision

Implement Academy Solo as a controlled, one-named-user pilot at the existing
Academy access boundary. The existing tenant row is a temporary isolation
boundary, not an RTO customer requirement. All active internal Vivacity staff
may manage the pilot lifecycle. Identity creation uses the existing Academy
User invitation flow. Do not revive the deprecated
`tenants.tenant_type` tier model, use a Sidekick package as a security
authority, create a second identity system, or introduce public billing in
this delivery slice.

## Changes prepared

- Added `has_academy_access_safe(uuid)`, a `SECURITY DEFINER`/fixed-search-path
  helper that accepts internal staff, active Academy-enabled tenant members,
  and `academy_only` tenant users while checking disabled/archived users.
- Tightened published course/module/lesson-outline, lesson-content,
  assessment/question, self-enrolment, assessment-attempt, and lesson-progress
  policies to use the helper and exact enrolment relationships.
- Preserved a user's own historical enrolments, progress, assessment attempts,
  and certificates as readable history while requiring current Academy access
  for progress/attempt writes and active completion.
- Added a staff-only `manage_academy_solo_access` RPC that updates the existing
  Academy fields and writes an `audit_eos_events` lifecycle record. The RPC
  does not create packages, RTO records, or payment state; identity creation
  remains in the existing invitation flow.
- Added a staff-only `create_academy_solo_account` RPC and a separate
  **Academy Customers → Create Academy Solo** flow. It creates one
  Academy-enabled account, disables RTO-side feature flags, records the
  account/catalogue policy, and audits the creation without creating a package,
  RTO profile, or payment.
- Applied the two Academy Solo migrations to both the allowlisted QA project
  and production for controlled testing. A post-apply ACL check caught that
  Supabase retained explicit `anon` grants despite `REVOKE FROM PUBLIC`; the
  corrective `academy_solo_revoke_anon_function_grants` migration removed
  those grants in both environments before any account or invite was created.
- Routed the existing staff Academy Customers page through the audited
  lifecycle RPC, expanded the staff route/capability to all active internal
  staff, and added an explicit Solo-pilot marker/end action so ordinary RTO
  Academy access is not silently reclassified.
- Added a bounded **Invite Academy User** action that reuses the existing
  invitation/identity flow, defaults to the `academy_user` relationship, and
  pre-fills the named learner from the creation form.
- Kept the existing Mailgun `unicorn_accept_invite_v1` invitation template and
  contextualised Academy Solo variables as **Vivacity Academy** / **Academy
  learner**, while preserving ordinary RTO invitation wording.
- Added static Edge contract tests and the Phase 1 implementation packet,
  including the four-initiative dependency matrix and consolidated product
  questions.

## Verification

- `npm run test:edge` — passed (301 tests, including the six Academy Solo
  contract tests and two Academy invitation-context tests).
- `npm run lint:ratchet` — passed for the changed frontend files.
- `npm run typecheck` — passed for the final tree.
- `npm run test:frontend` — passed serially (74 files passed, 6 skipped; 579
  tests passed, 43 skipped). A concurrent run hit two authentication-test
  timeouts; the isolated authentication file and the serial full suite both
  passed.
- `npm run build` — passed, including the email redirect check and critical-CSS
  inlining.
- `node scripts/check-kb-links.mjs` — passed (160 files, 1,295 local links,
  zero broken).
- `git diff --check` — passed.
- Hosted postflight passed on both `unicorn-qa` and production: the Academy
  Solo migrations plus the corrective grant migration are in each Supabase
  migration ledger, the three RPCs and outline view exist, four protected
  Academy policies are present, and the four touched RPCs have no `anon`
  EXECUTE privilege. Authenticated positive and negative-case testing still
  remain pilot gates.

## Hosted/deployment boundary

The allowlisted `unicorn-qa` schema and the configured production schema were
changed only by applying `academy_solo_account_provisioning_20260914064041`,
`academy_solo_access_boundary_20260914120000`, and
`academy_solo_revoke_anon_function_grants_20260914150000`; no production tenant,
production account, invitation, or learner data was created by the migration.
The local Vite server is now running against production so the existing
`invite-user` and `send-invitation-email` Edge Functions are available for the
requested invite test. Public launch, billing, and broad rollout remain out
of scope.
