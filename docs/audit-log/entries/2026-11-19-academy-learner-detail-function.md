# Audit: 2026-11-19 — academy-learner-detail-function

**Trigger:** Carl asked that clicking a person in "Your team" on the client Academy page opens a mini page with all of that person's relevant data, like the full report.
**Scope:** one new read-only function, `public.get_tenant_academy_learner_detail(p_tenant_id bigint, p_user_id uuid)` (migration `20261119210000_get_tenant_academy_learner_detail.sql`), and the portal code that uses it. No table, column, policy, trigger or data change.
**Status:** Written and reviewed in the pull request. **Not yet applied to production**: it needs Carl's explicit go-ahead, then a preflight, dry run and postflight recorded here. Until it is applied, clicking a person shows "Could not load this person's Academy activity".

## What the function does

For ONE person in ONE organisation it returns: their name and email; totals (courses chosen and finished, certificates, lessons completed and available, minutes, last active); one row per course they chose (dates, started, certified, lessons done of total, minutes, last touched); and a 12-week series of lessons completed and minutes. It uses the same rules as `get_tenant_academy_learner_analytics`: only enrolments the person chose themselves (`source = 'self_enrol'`), and the corrected watch-time and "started" definitions from `20261119170000`.

## Access

Same check as the organisation-wide function: the caller must be the organisation's primary or secondary contact with full access, or Vivacity internal (superadmin, admin or `is_vivacity_internal`); anyone else gets "Not authorized for this tenant". Every query is restricted to `p_tenant_id` and `p_user_id`, so asking about a person who belongs to a different organisation returns an empty result (no courses, null learner) rather than their data. `SECURITY DEFINER`, `search_path` pinned, execute granted to `authenticated` only (revoked from `public` and `anon`). Needed because `academy_lesson_progress` is not readable by a client admin.

## To do before applying

Dry run in production inside a rolled-back transaction as a real primary contact: one person from their own organisation returns rows; a person from another organisation returns nothing; a caller who is not a contact is refused. Then apply, and confirm exactly one overload, authenticated-only execute.

**Rollback:** `drop function public.get_tenant_academy_learner_detail(bigint, uuid);` (the team list keeps working; the mini page shows its error message).
