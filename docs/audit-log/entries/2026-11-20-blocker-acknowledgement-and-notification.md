# Audit: 2026-11-20 — blocker-acknowledgement-and-notification

**Trigger:** Carl asked to build the blocker acknowledgement and notifications, the follow-up left open when the staff view and the attention list were built.
**Scope:** migration `20261120090000_blocker_acknowledgement_and_notification.sql`: five new empty columns on `public.package_checkins` (`acknowledged_at`, `acknowledged_by`, `resolved_at`, `resolved_by`, `staff_note`) with two check constraints, one new staff function `set_package_blocker_status`, and replacements (same names and signatures) of `submit_package_checkin`, `get_package_checkin_state`, `get_tenant_checkins_overview` and `get_checkins_attention`. Portal changes in the client check-in card, the staff client card and the dashboard attention card. No existing row is changed.
**Status:** Written and dry-run in production (everything rolled back). **Not yet applied**: needs Carl's explicit go-ahead. Until it is applied the staff card and attention card keep working on the previous functions except that the new buttons fail with a plain error message, and no notification is created.

## What it does

- **Notification:** when a client flags a blocker, the package manager gets one in-app notification (`user_notifications`, type `client_blocker`, link to the client page, dedupe key `client_blocker:<id>` so it cannot be created twice). It names the client, the person and the category, and does **not** repeat the client's own words. No notification if the package has no manager or the manager is disabled or archived. In-app only: no email or other outbound message is sent. At most three blockers a day per person per package already bounds volume.
- **Acknowledge, resolve, reopen:** Vivacity staff and super admins can mark a blocker seen, resolved or reopened (`set_package_blocker_status`), with an optional note of up to 280 characters. The row is locked while it changes, only blockers can be changed, and the actions are `acknowledge`, `resolve` and `reopen` only.
- **The note is shown to the client.** It is written by staff for the client and appears on the client's own blocker ("From your consultant"), so it must hold nothing internal. The staff screen says so beside the box.
- **Client view:** the client's own state now lists their blockers from the last 30 days with where each stands (sent, seen, resolved) and the note.
- **Staff view and attention list:** only unresolved blockers count as needing attention (resolved ones stay on the client card for context). The attention list also reports how many are new (not yet seen) and shows a "New" badge; ordering puts blockers nobody has seen first.
- Answers are still not scored, feed no health score and are never sent to AI.

## Dry run (production, read-only, rolled back)

Inside a rolled-back block, with a real package that has a manager:
- A client contact flagged a blocker. Their own state listed it with status "flagged".
- That client calling the staff function: refused ("Not authorized").
- The package manager saw exactly one notification of type `client_blocker`. Its text named the client, the person and the category and did not contain the words the client wrote. (The test printed that notification's title and message, so one client name and one person name appeared in the test output; no answer text did. Earlier dry runs printed no names.)
- Staff attention list: 1 blocker, 1 new. An unknown action and a 281-character note were each refused. After "acknowledge" with a note: 1 blocker, 0 new. After "resolve": the package dropped off the list. After "reopen": back on the list with 1 blocker.
- The staff client overview showed the resolved blocker with status "resolved", who saw it and the note. The client's own state afterwards showed status "seen" and the note.

## Migration safety allowlist

The scanner flags the statements inside the function bodies (two inserts, three updates). They are runtime DML, not migration-time DML; the migration inserts and changes no row when applied. A proposed allowlist entry (expires 18 December 2026) is in the pull request for Carl's review.

## Not built (follow-up)

- Email or other push notification (this is in-app only).
- Notifying the client when a blocker is marked seen or resolved (they see the status and note on the package page).
- Goals per stage, post-consult feedback, AI summaries of comments.

**Rollback:** restore the four replaced functions from migrations `20261120030000`, `20261120050000` and `20261120070000`, then `drop function public.set_package_blocker_status(uuid, text, text);` and drop the five columns (the status and notes recorded so far would be lost).
