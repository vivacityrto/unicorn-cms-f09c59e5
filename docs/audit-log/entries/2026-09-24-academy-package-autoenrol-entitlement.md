# Audit: 2026-09-24 — package auto-enrol → entitlement-then-self-start model

**Trigger:** ad-hoc (follow-up to the new Academy Customers tenant detail
page — Carl noticed the Analytics tab's "Actions to consider: check in with
X" nudges included staff who were auto-enrolled by a package rule and never
opened the course, making stalled-learner signal indistinguishable from
"never cared about this course")
**Scope:** package-based Academy auto-enrol
(`fn_academy_autoenrol_on_package_instance`) and its retroactive backfill
RPC (`fn_academy_backfill_enrollments_for_rule`) only. The separate
"mandatory for all clients" trigger
(`fn_academy_autoenrol_on_mandatory_publish`) was deliberately left
untouched — a real compliance-mandate feature, not a convenience mapping,
per an explicit scope decision made before implementation.

## Findings

- Package-based auto-enrol previously inserted a real `academy_enrollments`
  row with `status='active'` for **every** `tenant_users` row at a tenant
  the moment a package assignment matched a rule in
  `academy_package_course_rules` — with no role/audience filter at all, and
  regardless of whether the person ever opened the course. This polluted
  the Academy Tenant Detail Analytics tab (`AcademyActivityDashboard`),
  the "Enrolled" count on Academy Customers
  (`useTenantSummaries().enrolled_count`), and the staff-visible Timeline
  feed (`trg_academy_enrollment_timeline`, fires on every insert regardless
  of status/source), all of which had no way to distinguish a genuine
  self-started-then-stalled learner from an auto-assigned row nobody ever
  touched.
- A three-agent codebase sweep (RLS policies, RPCs, frontend consumers) plus
  live-DB verification (`pg_get_functiondef`, `pg_get_constraintdef`, a real
  sample query against `academy_package_course_rules`/`target_audience`)
  confirmed this table is load-bearing across 5+ RLS-gated tables, 8+
  status-filtering call sites, a client-side seat-cap-display query, and the
  retroactive backfill tool — the same class of coupling that caused the
  2026-08-28 incident (`docs/audit-log/entries/2026-08-28-academy-lesson-outline-safe-rpc.md`),
  where an RLS policy gated on enrolment existence silently broke catalog
  browsing for non-enrolled users.
- Confirmed `academy_courses`/`academy_modules` RLS already gates purely on
  `status='published'` + `has_academy_access_safe(auth.uid())` — zero
  enrolment dependency. But the client catalog query
  (`src/hooks/useAcademyCourses.ts`) additionally filters by
  `target_audience @> [audienceKey]`, a plain client-side filter — meaning a
  package-entitled course whose own audience tag doesn't cover a given
  tenant's staff (the trigger enrolled every `tenant_users` row with no role
  filter) would have become genuinely invisible to that person if the
  trigger's insert were simply deleted with no replacement. The fix
  therefore had to *add* a visibility path, not just remove the premature
  insert, to avoid repeating the 8-28 regression.
- Confirmed Academy Solo (`create_academy_solo_account`) already proves half
  this pattern: it never inserts `academy_enrollments` rows for its "all
  published courses" catalog access — that comes purely from
  `tenants.academy_access_enabled=true` + published-course RLS, with the
  real enrolment created later by the same `enrol_in_academy_course` RPC
  everyone uses. Confirmed via live DB that `enrol_in_academy_course` and the
  `academy_enrollments` unique constraint (`(course_id, user_id)`, not
  tenant-scoped) required no changes.

## Code changes

- New table `academy_tenant_course_entitlements (tenant_id, course_id,
  package_id, granted_at)`, unique on `(tenant_id, course_id)` — a
  tenant-level "this package entitles this course" fact, with no `user_id`
  and no per-seat semantics.
- Rewrote `fn_academy_autoenrol_on_package_instance`: now inserts a tenant-
  level entitlement row instead of a per-user `academy_enrollments` row; the
  per-user loop and inline seat-cap subquery were removed (nothing to cap
  until a real self-enrolment happens).
- New `SECURITY DEFINER` RPC `get_academy_catalog_courses(p_audience_key)`
  (same narrow, additive-only pattern as `get_academy_course_lesson_outline_safe`
  from the 2026-08-28 fix): returns published courses matching the caller's
  audience tag **or** a package entitlement held by the caller's tenant.
  Replaces the raw `academy_courses` query in `src/hooks/useAcademyCourses.ts`.
  `GRANT EXECUTE ... TO authenticated` only.
- Rewrote `fn_academy_backfill_enrollments_for_rule` to grant tenant-level
  entitlements (via `package_instances` → rule match) instead of inserting
  real per-user enrolments — same staff-only guard, same call sites
  (`src/hooks/academy/useAcademyPackageRules.ts`), same RPC name/signature.
  Updated its preview query (`useBackfillPreview`, now counts tenants not
  yet entitled instead of users not yet enrolled) and UI copy
  (`BackfillConfirmModal.tsx`) to describe granting entitlement, not
  enrolling users.
- Follow-up fix from `get_advisors`: revoked `anon`/`authenticated`/`public`
  execute on `fn_academy_autoenrol_on_package_instance` — a trigger-only
  function was flagged as directly callable via RPC.
- Regenerated `src/integrations/supabase/types.ts` (clean, additive-only
  diff — 233 insertions, 0 deletions).
- No changes needed to: `enrol_in_academy_course`, `enrol_as_impersonator`,
  `complete_academy_enrollment`, `complete_enrollment_as_impersonator`,
  `score_academy_attempt`, `fn_academy_issue_certificate_for_enrollment`, the
  5 admin mutation RPCs, `get_tenant_academy_analytics`,
  `useTenantSummaries().enrolled_count`, or
  `trg_academy_enrollment_timeline` — all only ever touch real,
  self-or-staff-initiated enrolments, so their existing numbers become
  accurate automatically.

## Decisions

- Scoped to package-based auto-enrol only; the "mandatory for all clients"
  trigger stays untouched (Carl's explicit call — real compliance-mandate
  tracking, not a convenience mapping, and changing it could have
  compliance-reporting implications beyond analytics accuracy).
- Chose a new tenant-scoped table over reusing `academy_enrollments` with a
  new status value: the existing unique constraint is `(course_id,
  user_id)`, not tenant-scoped, and `academy_enrollments` is read by ~8
  status-filtering call sites (analytics, seat-cap display, the Timeline
  trigger) that would all need updating to exclude a new status value. A
  separate table means those call sites are correct by construction — they
  simply never see entitlement rows.
- `AcademyEnrolmentsPage.tsx`'s "Auto-enrolled (lifetime)" stat tile and
  `auto_package` source filter, and the rule dashboard's
  `auto_enrollments_to_date` counter (`fn_academy_rule_dashboard_stats`),
  were left as read-only historical reporting — they'll simply stop growing
  going forward. Noted here rather than changed, since they're presentation
  only, not a functional gate.

## Live verification (Demo RTO, tenant 7547, real hosted DB — not a
   sandbox/branch)

- **Baseline (pre-migration):** Demo RTO's persona already had
  `academy_enrollments` for "1-Day Workshops 2026 — TAS and Outcome
  Standards" showing "In Progress" at 0% (0 of 43 lessons) in both the
  catalog and "My Courses" — a live, real example of the exact bug being
  fixed. This pre-existing row is historical data and was left untouched
  (the fix only changes future behaviour).
- Applied the migration; `get_advisors` run and the one real finding fixed
  (see above).
- Confirmed via live DB that Demo RTO already held package M-RR
  (`package_instances.id=15201`) with two active rules
  (`academy_package_course_rules`) that had never been auto-enrolled — the
  trigger only fires `AFTER INSERT`, not `UPDATE`, so a rule added after the
  package assignment already existed had never applied (exactly the
  backfill tool's reason to exist).
- Exercised the rewritten `fn_academy_backfill_enrollments_for_rule` for the
  M-RR → "Assessment Validation" rule (via `set local role
  authenticated`/`request.jwt.claims` impersonating a real staff account, in
  the same transaction) — created 9 new tenant entitlements across real
  production tenants holding that package, Demo RTO included. Confirmed via
  SQL: an `academy_tenant_course_entitlements` row was created for Demo RTO,
  zero `academy_enrollments` rows.
- Live browser check (Demo RTO persona, `carl+demo@vivacity.com.au`,
  `npm run dev`): "Assessment Validation" now appears in the Trainer Hub
  catalog tagged **"Not Started"** with a "Start Course" button (not
  falsely "In Progress"), and does **not** appear in "My Courses" — correct.
  Clicked "Start Course": confirmed via SQL a real `academy_enrollments` row
  was created (`status='active', source='self_enrol'`), and the lesson
  viewer loaded with full module navigation and unlocked content (RLS
  correctly permitted access once the real enrolment existed).
- Cleanup: deleted the one test self-enrolment created by that verification
  click (`id=12351`) — a QA action, not a real user decision. The 9
  entitlement grants from the backfill call (Demo RTO + 8 other real
  tenants legitimately holding package M-RR) were **kept** — they're a
  correct, non-destructive, purely-additive-visibility outcome of an
  already-existing active rule, not test artifacts.
- `npm run typecheck`, `npx eslint` (changed files), `npm run
  test:frontend` (589 passed), `npm run test:edge` (321 passed) — all
  clean.

## Related prior incident

`docs/audit-log/entries/2026-09-22-fix-academy-autoenrol-orphaned-tenant-users.md`
fixed this exact trigger two days earlier: a bulk per-user insert off raw
`tenant_users` rows with no `auth.users` FK check meant one orphaned
`tenant_users` row could abort the whole package-start transaction for
every tenant hitting it. The rewrite here removes the `tenant_users` join
from this trigger entirely (entitlement is granted per tenant, not per
user), so that whole bug class can no longer occur in this function —
noted as a side benefit, not something separately verified as a fix (no
orphaned-row regression test was re-run here, since the join it guarded no
longer exists).

## Open questions parked

- None.
