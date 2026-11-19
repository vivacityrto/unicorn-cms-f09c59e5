# Audit: 2026-11-20 — tenant-checkins-overview

**Trigger:** Carl asked to build the staff view of client check-ins, so the answers collected on the package page are visible to Vivacity.
**Scope:** one new read-only function, `public.get_tenant_checkins_overview(p_tenant_id bigint)` (migration `20261120050000_get_tenant_checkins_overview.sql`), and a "Client check-ins" card on the staff client page's Overview tab. No table, column, policy or data change.
**Status:** Applied to production on 20 November 2026 on Carl's explicit go-ahead ("Apply it"), after a dry run. Postflight below. The card goes live when this pull request is merged.

## What it returns

For each live (not complete) package of the organisation: every person's last six pulse scores and latest audit-confidence rating, by display name only, and the blockers flagged in the last 30 days (category, the short description the client wrote, who, when). No email, no user id, no phone. The blocker description is client-written free text meant for their consultant; the portal renders it as plain text, and it is not sent to any AI (a test fails if the insight code ever references this function).

## Who can call it

Vivacity staff (`app.is_vivacity_team()`) and super admins only; anyone else, and anyone not signed in, gets "Not authorized". It reads only rows for `p_tenant_id`. `SECURITY DEFINER`, empty `search_path`, execute granted to `authenticated` only (revoked from `public` and `anon`). It is needed because staff need display names from `public.users`, which a direct read of the check-in table would not give.

## Flags (two plain rules, no score)

- **Blocker flagged:** any blocker in the last 30 days.
- **Two low pulses in a row:** a person's last two pulses are both 2 or lower.
- A package nobody has answered reads "No check-ins yet", never as fine. Answers feed no health score and are not scored.

## Dry run (production, read-only, rolled back)

Inside a rolled-back block: inserted two pulses (2 then 1) and a confidence rating for a real client contact, a recent blocker and a 45-day-old blocker, created the function, and called it as Vivacity staff.
- Returned the organisation's live package with the person, their pulses, their confidence, and exactly one blocker (the 45-day-old one was left out).
- The person object held only `name`, `pulses` and `confidence`; the blocker object held only `name`, `comment`, `category` and `created_at`.
- A client contact calling it: refused ("Not authorized"). No sign-in: refused.
- No names, emails or answer text were printed.

## Production

Preflight: function absent, migration not recorded, the `package_checkins` table present. Applied with the exact migration SQL. Postflight: exactly one overload `(bigint)`, `SECURITY DEFINER`, execute granted to `authenticated`, not to `anon`; the check-in table is unchanged (empty). No table or data changed.

## Not built (follow-up)

- A way for a consultant to acknowledge or resolve a blocker (needs a write path and a new column or table); blockers simply age out after 30 days.
- A cross-client list of what needs attention, and notifications to the consultant. The flags show on each client's page only.
- Goals per stage, post-consult feedback, AI summaries of comments.

**Rollback:** `drop function public.get_tenant_checkins_overview(bigint);` (the card shows its error message; nothing depends on it).
