# Audit: 2026-11-20 — package-checkins

**Trigger:** Carl asked to build the client check-ins designed in the package analytics review: a way to collect input from clients inside the package feature.
**Scope:** one new table `public.package_checkins` (with row security), two new client-facing functions `submit_package_checkin` and `get_package_checkin_state`, one internal helper `package_checkin_caller_ok` (migration `20261120030000_package_checkins.sql`), and the portal card. No existing table, policy or data is changed.
**Status:** Written and dry-run in production (everything rolled back). **Not yet applied**: needs Carl's explicit go-ahead. Until it is applied the check-in card shows nothing (the state call fails quietly) and the rest of the page is unchanged.

## What is collected

- **Pulse:** "How is this package going for you?", 1 to 5, optional note, due every two weeks.
- **Confidence:** "How confident are you about your next audit?", 1 to 5, weekly.
- **Blocker:** a category (people, evidence, time, system, other) and a short description, on demand, at most three a day.
- Notes are limited to 280 characters. Free text is untrusted client input and is **not sent to any AI** and not read by the health or insight code (a test fails if the insight function ever references the table).

## Who can write, who can read

- **Write:** only through `submit_package_checkin`. There is no insert, update or delete policy and the table's write privileges are revoked, so a direct write is refused. The function takes the person from the sign-in and the organisation from the package, and the caller must be a full-access member of that organisation (`tenant_users.access_scope = 'full'`) who passes `app.user_can_access_tenant` (so disabled and archived users are refused), for a package that is not complete. Vivacity staff who are not members of the organisation, including those previewing a client, are refused, so previewing never creates a client's answer.
- **Rate limits (per person per package):** one pulse per 13 days, one confidence rating per 6 days, three blockers per 24 hours; refusals start with `RATE_LIMITED`.
- **Read:** a client reads only their own rows (`user_id = auth.uid()`); Vivacity staff read all rows (`app.is_vivacity_team()`). A client sees their own answers and trend in the card.

## Dry run (production, read-only, rolled back)

Run in a block that creates the table and functions, acts as real users, then raises an error so everything rolls back. (The first attempt found the policy used a function name that does not exist and the second picked a disabled contact; both fixed in the test, not the design, and the disabled contact was correctly refused.)
- A full-access, enabled contact: state showed eligible and pulse due; a pulse saved; a second pulse refused (`RATE_LIMITED`); a score of 9 refused; a blocker with no description refused; a blocker with a description saved; a direct insert refused ("permission denied"); state afterwards showed pulse not due, 1 answer in history, 1 blocker in 30 days; the person could read their 2 rows.
- A contact of another organisation: submit refused ("Not authorized for this package") and 0 rows readable.
- Vivacity staff who is not a member: submit refused; 2 rows readable (the staff read policy).
- No sign-in: refused.
- No names, emails or answer text were printed.

## Review fixes (before applying)

- **Staff with a membership:** a staff account that also holds a full-access membership of an organisation used to pass the gate. The helper now also refuses Vivacity team, super admins and internal or admin accounts. Verified in a rolled-back production test by giving a real staff user a temporary membership: submit refused, state not eligible.
- **Overlapping submissions:** two requests from the same person at the same moment could both pass the rate-limit checks. The function now takes a per-person, per-package advisory lock before the checks, so they run one after another.

## Not built (follow-up)

- **Staff side:** nothing in the staff portal shows these answers yet. Staff can read the table (policy exists) but a consultant view, an alert after two low pulses or a blocker, and trend on the client dashboard still need building. Without that the data is collected but not yet surfaced.
- Goals per stage, post-consult feedback, and AI summaries of comments (button-triggered, draft only) are not built. Answers are kept out of any health score until the thresholds are signed off.

**Rollback:** `drop function public.get_package_checkin_state(bigint, bigint); drop function public.submit_package_checkin(bigint, bigint, text, smallint, text, text); drop function public.package_checkin_caller_ok(bigint, bigint); drop table public.package_checkins;` (the card then shows nothing; all collected answers are lost, so export first if any exist).
