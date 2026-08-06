# Audit: 2026-06-11 — zero-minute-time-entries

**Trigger:** ad-hoc — Dave requested ability to log 0-minute time entries as
activity-only records (e.g. a quick email reply, a check-in call) that show up
in the activity feed without consuming any package hours.
**Scope:** `AddTimeDialog.tsx` and `EditTimeDialog.tsx` guard change; `v_client_package_hours_recent`
view updated to include 0-minute entries. No changes to timer stop, calendar import,
meeting-derived dialogs, or any hour-aggregation surface.

## Findings

- `time_entries.duration_minutes` — `integer NOT NULL`, no CHECK constraint. The DB
  already accepts 0; the block was purely in the frontend.
- `AddTimeDialog.tsx:401` — `if (totalMinutes <= 0) return;` silently dropped 0-minute
  submits. Single-character fix to `< 0`.
- `EditTimeDialog.tsx:255` — same guard; would have prevented editing any 0-minute
  entry once created. Fixed in the same session for consistency.
- `v_client_package_hours_recent` — `ranked` CTE had `AND te.duration_minutes > 0`
  and `AND te.duration_minutes IS NOT NULL`. Both removed so 0-minute activity entries
  appear in the Recent Work feed. Column is `NOT NULL` so the IS NOT NULL guard was
  redundant anyway.
- All burndown/hours views and the trigger (`tg_recalc_package_hours_used`) correctly
  keep or compute `duration_minutes > 0` filtering — 0-minute entries contribute 0
  to every SUM, so no impact on hours_used, burn-down, forecasts, or billable totals.
- 10 pre-existing 0-minute entries were already in the DB; they are now visible in the
  Recent Work feed.
- Guards intentionally left unchanged: `AddTimeFromMeetingDialog.tsx:132`,
  `CalendarTimeCapture.tsx:805`, `TimeInbox.tsx:829` — 0 minutes is nonsensical in
  those entry contexts.
- `security_invoker=true` preserved on `v_client_package_hours_recent`.

## KB changes shipped

- No KB changes this session.

## Codebase observations

- unicorn @ `fe4cb906` (origin/HEAD): migration
  `20260611060223_cf8974e5-15bd-4357-bad4-d12dea00e2b0.sql` applied —
  `v_client_package_hours_recent` recreated without `duration_minutes > 0` guard.
  `AddTimeDialog.tsx:401` and `EditTimeDialog.tsx:255` both changed `<= 0` → `< 0`.
- Post-deploy verification passed: `duration_minutes > 0` removed from view definition;
  `security_invoker=true` preserved; 10 pre-existing 0-minute entries now visible in
  Recent Work; `hours_used` unaffected.

## Decisions

- `EditTimeDialog.tsx` also fixed — 0-minute entries must be editable after creation.
- Timer stop (`GREATEST(1, ...)`) left unchanged — timer entries should never be 0.
- Meeting-derived and calendar dialogs left unchanged — 0 is not meaningful there.

## Open questions parked

- No open items from this session.

## Tag
audit-2026-06-11-zero-minute-time-entries
