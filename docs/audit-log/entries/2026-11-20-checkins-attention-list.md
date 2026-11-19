# Audit: 2026-11-20 — checkins-attention-list

**Trigger:** Carl asked to build the consultant attention list: a cross-client view of which clients' check-ins need a consultant now.
**Scope:** one new read-only function, `public.get_checkins_attention()` (migration `20261120070000_get_checkins_attention.sql`), and a "Client check-ins needing attention" card on the staff dashboard (`MainDashboard`). No table, column, policy or data change.
**Status:** Applied to production on 20 November 2026 on Carl's explicit go-ahead ("Apply it"), after a dry run. Postflight below. The dashboard card goes live when this pull request is merged.

## What it lists

One row per live (not complete) package that has either of two plain flags, the same two the per-client card uses, no score:
- **Blocker:** a blocker flagged in the last 30 days.
- **Two low pulses in a row:** a person's last two pulses are both 2 or lower, the latest within the last 45 days (an older streak is history, not something to chase today; the per-client card keeps showing the full history).

Each row has the client and package names, the package manager's display name and id (so the dashboard can offer "My clients"), the blocker count, the latest blocker (category, the client's short description clipped to 160 characters, who wrote it, when) and the number of people on a low streak. Sorted blockers first (newest first), then low streaks. Names only: no email, no person id.

## Who can call it

Vivacity staff (`app.is_vivacity_team()`) and super admins only; anyone else, and anyone not signed in, gets "Not authorized". `SECURITY DEFINER`, empty `search_path`, execute granted to `authenticated` only (revoked from `public` and `anon`). The client's description is client-written text meant for their consultant; the portal renders it as plain text and it is never sent to an AI (a test fails if the insight code ever references this function).

## Dry run (production, read-only, rolled back)

Inside a rolled-back block: a recent package got two low pulses and a blocker with a 200-character description; another package got an old low streak (70 and 90 days ago) and an old blocker (40 days).
- The recent package was listed with 1 blocker, 1 person on a low streak, and the description clipped to 160 characters.
- The old package was not listed.
- The row held only client, package and manager names, the manager id, counts and the latest blocker's category, comment, name and date: no email, no person id.
- A client contact calling it: refused ("Not authorized"). No sign-in: refused.
- No names, emails or answer text were printed.

## Production

Preflight: function absent, migration not recorded, the `package_checkins` table present. Applied with the exact migration SQL. Postflight: exactly one overload `()`, `SECURITY DEFINER`, execute granted to `authenticated`, not to `anon`; the check-in table is unchanged (empty). No table or data changed.

## Not built (follow-up)

- Acknowledging or resolving a blocker (needs a write path); flags age out by themselves.
- Notifications (email or in-app) when a blocker arrives; this list is looked at, not pushed.
- Goals per stage, post-consult feedback, AI summaries of comments.

**Rollback:** `drop function public.get_checkins_attention();` (the card hides itself; nothing depends on it).
