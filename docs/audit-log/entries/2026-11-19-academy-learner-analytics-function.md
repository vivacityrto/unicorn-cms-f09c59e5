# Audit: 2026-11-19 — academy-learner-analytics-function

**Trigger:** Carl asked for the client portal Academy analytics to be redesigned around data that makes sense to a client. The agreed rule (19 November 2026) is that only courses learners chose themselves count.
**Scope:** one new read-only function, `public.get_tenant_academy_learner_analytics(p_tenant_id bigint)` (migration `20261119150000_get_tenant_academy_learner_analytics.sql`). No table, column, policy, trigger or data change.
**Status:** NOT yet applied to production. Dry-run done (below). Applying needs Carl's explicit go-ahead; the screen change in the same PR must not be merged before the function exists, because the page calls it.

## Why a function

`academy_lesson_progress` is readable only by the learner (the broad staff read was dropped in `20260924120000`), so a client admin cannot read lesson counts or watch time directly. The existing `get_tenant_academy_analytics` counts every enrolment source and has no lessons-completed or per-person view. The new function follows the same pattern (SECURITY DEFINER, tenant-scoped, aggregates only).

## What it returns

Only enrolments with `source = 'self_enrol'` and `revoked_at is null` count (an allowlist, so any new source is excluded). It returns totals (learners, chosen, finished, certificates, lessons completed, learning minutes, active in 30 days, and a not-counted figure for enrolments added another way), a 12 week trend, per-course figures, per-learner figures (name and email of the client's own staff, as the existing staff stats function already returns), and up to 20 chosen courses untouched for 30 days.

## Access

The same check as `get_tenant_academy_analytics`: a `primary_contact` or `secondary_contact` with full access scope for that tenant, or Vivacity staff. Anyone else gets "Not authorized for this tenant". Execute is granted to `authenticated` only; revoked from `public` and `anon`. It never reads another tenant's rows (`tenant_id = p_tenant_id` on the only table that carries tenant scope; lesson progress and certificates are reached through those enrolments).

## Dry run (production, read-only, rolled back)

Run inside a block that raised at the end, with the access check removed and the function created in the session's temp schema, for tenant 7512 (the largest, which has 304 enrolments added another way): 103 chosen, 57 finished, 14 learners, 23 certificates, 478 lessons completed, 11,851 minutes, 4 active in 30 days, not counted 304 (3 finished), 69 courses, 20 untouched, 12 weeks of trend. Nothing was created or changed; the block's names and emails were not printed.

## Known limits

- Hours are video watch time, not wall-clock time.
- "Finished" means the enrolment has a completion date; the scorecard's certificate-based definition can differ slightly (certificates are shown separately).
- The old `get_tenant_academy_staff_stats` and `get_tenant_academy_analytics` hooks are no longer used by the screen and are left in place.
- The same dashboard component is used on the staff tenant page, so staff now see the learner-chosen view there too.

**Rollback:** `drop function public.get_tenant_academy_learner_analytics(bigint);` (nothing else depends on it except the new screen).
