# Audit: 2026-11-20 — client-package-activity-function

**Trigger:** Carl asked for a full analytics overhaul of the client package page: where hours went, a timeline of activity, a weekly snapshot, and non-sensitive insight from Vivacity's internal notes.
**Scope:** one new read-only function, `public.get_client_package_activity(p_tenant_id bigint, p_package_instance_id bigint)` (migration `20261120010000_get_client_package_activity.sql`), and the portal code that uses it. No table, column, policy, trigger or data change.
**Status:** Written and dry-run in production (read-only, rolled back). **Not yet applied**: needs Carl's explicit go-ahead. Until it is applied the new analytics section on the package page shows "Couldn't load the activity analytics" and the rest of the page is unchanged.

## What it returns (aggregated only)

- `daily`: minutes and entry counts per day per work type (Sydney dates). No consultant, no time-entry notes.
- `touchpoints`: weekly counts of internal notes on this package for four allow-listed kinds only: email, meeting, call (note types `phone-call` and `phone`), follow-up. No note text, title, tags, assignees, attachments, and nothing at all for any other kind (so no escalation, risk or general notes).
- `tasks`: weekly counts of client-visible tasks created and completed (`item_type = 'client'`).
- `documents`: weekly count of documents generated for the package (through its stage instances).
- `window`: the renewal window the figures cover.

Same rules as `get_client_package_hours_by_type` and `get_client_package_hours_timeline`: billable only, carry-over excluded, same renewal window, minutes from allocations where an entry is split across packages. `SECURITY DEFINER`, `search_path` empty, `row_security` off, tenant checked with `app.user_can_access_tenant` AND against the package instance, execute granted to `authenticated` only.

## Dry run (production, read-only, rolled back)

Run in a block that creates the function, calls it as a real primary contact, then raises an error so everything rolls back.

- Package with the most billable entries in its current window: 51 day-and-type rows totalling 5,049 minutes, which equals the 5,049 minutes returned by the existing `get_client_package_hours_by_type` for the same package (the two reconcile exactly). 32 weekly touchpoint rows covering all four kinds, 6 weekly document rows, 6 work types, 0 task rows (that package has no client-visible tasks).
- Same caller asking about a package belonging to another organisation (using their own tenant id): empty result with a null window, no data.
- A contact of a different organisation: refused ("Not authorized for this tenant"). No sign-in: refused.
- No names, emails or note text were printed.

A source test (`PackageAnalytics.test.tsx`) also fails if the SQL ever references note text, titles, tags, assignees, attachments, time-entry notes or user ids, or widens the note kinds.

## Findings from the review (not changed here, need a decision)

1. `get_client_package_dashboard` returns `pinned_note_text` and the package page renders it. The pin is a staff-side pin, not a "visible to client" flag, and the banner severity is guessed from keywords in the text.
2. `get_client_package_hours_recent` returns the staff's free-text `time_entries.notes` to the client (only notes beginning "Imported from meeting:" are hidden). It also omits the billable filter the other hours functions use.
3. The `notes` select policy allows anyone with tenant access (`user_has_tenant_access`) to read all of that tenant's notes by direct query, which would include internal notes. Not tested with a client token; needs its own review.

## To apply

Preflight (function absent), apply the exact migration SQL, postflight (one overload, authenticated-only execute), record here.

**Rollback:** `drop function public.get_client_package_activity(bigint, bigint);` (the analytics section shows its error message; nothing else depends on it).
