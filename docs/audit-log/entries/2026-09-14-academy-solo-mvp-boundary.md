# Academy Solo MVP server boundary and audited pilot lifecycle

- **Date:** 2026-09-14
- **Author:** Codex
- **Status:** prepared on `codex/academy-solo-mvp`; hosted migration and deployment not applied
- **Scope:** Academy Solo controlled pilot implementation
- **Source:** `C:/Users/carls/.codex/.chatgpt-projects/g-p-6aa73a757abc8191971caabac7d73939/academy-solo-discovery-handoff.md`, repository Academy/RBAC/Tenant Operating Model evidence, and the Sidekick product/architecture council review

## Decision

Implement Academy Solo as a manually provisioned, one-named-user controlled
pilot at the existing Academy access boundary. Do not revive the deprecated
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
  Academy fields and writes an `audit_eos_events` lifecycle record. It does not
  create identities, packages, RTO records, or payment state.
- Routed the existing staff Academy Tenant Access page through that audited
  RPC and added an explicit Solo-pilot marker/end action so ordinary RTO
  Academy access is not silently reclassified.
- Added static Edge contract tests and the Phase 1 implementation packet,
  including the four-initiative dependency matrix and consolidated product
  questions.

## Verification

- `npm run test:edge` — passed (297 tests, including the four new Academy Solo
  contract tests).
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
- Authenticated negative-case QA still remains a release gate because the
  hosted migration has not yet been applied to an approved QA tenant.

## Hosted/deployment boundary

No Supabase migration, hosted function, production data, production tenant,
or production account was changed by this worktree. Applying the migration
requires review of the exact catalogue, pilot account, staff-role scope, and
webinar/replay interpretation, followed by the repository's normal migration
approval and rollback process.
