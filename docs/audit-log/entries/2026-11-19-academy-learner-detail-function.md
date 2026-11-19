# Audit: 2026-11-19 — academy-learner-detail-function

**Trigger:** Carl asked that clicking a person in "Your team" on the client Academy page opens a mini page with all of that person's relevant data, like the full report.
**Scope:** one new read-only function, `public.get_tenant_academy_learner_detail(p_tenant_id bigint, p_user_id uuid)` (migration `20261119210000_get_tenant_academy_learner_detail.sql`), and the portal code that uses it. No table, column, policy, trigger or data change.
**Status:** Applied to production on 19 November 2026 on Carl's explicit go-ahead ("Dry run, then apply"). Dry run and postflight below.

## What the function does

For ONE person in ONE organisation it returns: their name and email; totals (courses chosen and finished, certificates, lessons completed and available, minutes, last active); one row per course they chose (dates, started, certified, lessons done of total, minutes, last touched); and a 12-week series of lessons completed and minutes. It uses the same rules as `get_tenant_academy_learner_analytics`: only enrolments the person chose themselves (`source = 'self_enrol'`), and the corrected watch-time and "started" definitions from `20261119170000`.

## Access

Same check as the organisation-wide function: the caller must be the organisation's primary or secondary contact with full access, or Vivacity internal (superadmin, admin or `is_vivacity_internal`); anyone else gets "Not authorized for this tenant". Every query is restricted to `p_tenant_id` and `p_user_id`, so asking about a person who belongs to a different organisation returns an empty result (no courses, null learner) rather than their data. `SECURITY DEFINER`, `search_path` pinned, execute granted to `authenticated` only (revoked from `public` and `anon`). Needed because `academy_lesson_progress` is not readable by a client admin.

## Dry run (production, read-only, rolled back)

Run inside a block that creates the function, calls it as real users, then raises an error so everything rolls back. As a primary contact of the organisation with the most chosen courses: a person from that organisation returned their courses and name (1 course, 12 weekly points). First attempt found a gap: a person from a *different* organisation returned no courses but still returned their name and email. Fixed before applying: the learner row is returned only if the person is a member of the organisation or has a counted course there. Second dry run: same-organisation person returned data; other-organisation person returned 0 courses and no learner row; a contact of a different organisation was refused ("Not authorized for this tenant"); a call with no sign-in was refused. No names or emails were printed.

## Production

Preflight: function absent, migration not recorded. Applied with the exact migration SQL (including the membership restriction). Postflight: exactly one overload `(bigint, uuid)`, `SECURITY DEFINER`, execute granted to `authenticated`, not to `anon`. No table or data changed.

**Rollback:** `drop function public.get_tenant_academy_learner_detail(bigint, uuid);` (the team list keeps working; the mini page shows its error message).
