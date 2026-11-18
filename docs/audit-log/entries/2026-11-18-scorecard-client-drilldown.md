# Audit: 2026-11-18 — scorecard-client-drilldown

**Trigger:** Carl asked for an atomic breakdown behind the report's client and CSC tables, opening in place like a mini page on the same card, down to each person.
**Scope:** one new read-only database function, `public.get_cst_client_detail(bigint, date)`, plus the in-place drill-down screens in the scorecard report.
**Status:** migration written and reviewed in the PR. **Not yet applied to production** at the time of writing; the screens show an error line for the people list until it is applied. Apply only on Carl's explicit go-ahead.

## What changed

- New function `public.get_cst_client_detail(p_tenant_id bigint, p_anchor date)` returning one jsonb: every non-internal, non-archived person at one client with their role, contact flag, added date, last sign-in, last activity, whether they were active in the 28 days ending the anchor date, 28-day counts (pages, sign-ins, messages, lessons), their courses and their certificates.
- "Active" is the same definition as `cst_activity_stats` (portal page view, sign-in, message sent or read, Academy lesson finished, or a self-chosen enrolment).
- Staff only: the body rejects everyone else with `42501`, as `get_cst_report` does. `SECURITY DEFINER`, `STABLE`, empty `search_path`. `PUBLIC` and `anon` are revoked; `authenticated` and `service_role` can execute it.
- Nothing existing is altered: no table, column, policy, trigger or existing function changes, and nothing is written.
- Front end: a `DrillCard` that slides a mini page in over the Clients and By CSC cards with a Back trail, a client page (tiles, filter, people who open in place to their detail), and a CSC page listing that CSC's clients.

## Evidence

- The query core was run read-only against production for one client: 30 people, matching the 30 in the report row; 5 active against today's date (the report's 6 is as of the week end, which is what the screen passes as the anchor).
- `supabase/functions/scorecard-refresh/cst-client-detail.test.mjs` checks one function only, the staff gate before any read, the revoked grants, the activity definition and the rollback.
- `clientDetail.test.ts` and `DrillCard.test.tsx` cover parsing, status rules and the slide-in navigation.

## Known limits and follow-ups

- Courses and certificates are as of today; activity and "last did something" are as of the end of the week under review.
- Email addresses of client users are shown to Vivacity staff on this screen, which can already see them elsewhere in the app.
- The same drill-down is not yet on the certificate and "never signed in" lists.

## Production

Not applied yet. When applied, check: the function exists once, `anon` cannot execute it, a staff session gets rows, and a non-staff call is refused with `42501`.

**Rollback:** `supabase/migrations/rollback/20261118120000_cst_client_detail.down.sql` (drops only that function).
