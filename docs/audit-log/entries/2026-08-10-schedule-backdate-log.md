# Audit: 2026-08-10 — Audit Schedule backdating (log vs schedule)

**Trigger:** Carl asked why the Audit Schedule tab's date pickers (Evidence
due, Opening meeting, Closing meeting) can't be set to a date before today,
and what a consultant is supposed to do if a meeting — e.g. the opening
meeting — already took place. Follow-up: Carl pointed out that even once
past dates are allowed, calling the action "Schedule" doesn't make sense for
something that's already concluded.
**Author:** Claude (session run by Carl)
**Scope:** Three frontend files (`AppointmentPanel.tsx`, `useAuditSchedule.ts`,
`ScheduleTab.tsx`). No schema changes. No RLS changes.

---

## Findings

- **Root cause of the original complaint:** all three "Set date" pickers
  (Evidence due, Opening, Closing) share one component, `AppointmentPanel`,
  whose `Calendar` had a hardcoded `disabled={(d) => d < today}` guard —
  a single line blocking every past date across all three cards.
- **Backdating wasn't just blocked, it was also wired for the wrong side
  effects.** `useScheduleAuditPhase`'s mutation always creates a
  `calendar_events` row and calls `sync-outlook-calendar` with
  `send_invites: true` for `opening_meeting`/`closing_meeting`. Simply
  lifting the date restriction would have let a consultant send a real
  Outlook meeting invite for a date that's already passed — confusing at
  best, and a false notification to the client at worst.
- **The stage-task system already models this distinction and the frontend
  never used the other half of it.** `complete_audit_stage_tasks(p_audit_id,
  p_milestone)` accepts a `'conducted'` milestone value (distinct from
  `'scheduled'`) with its own task-ID mappings per stage — confirmed via
  `pg_get_functiondef`. `useScheduleAuditPhase` only ever passed
  `'scheduled'`. The correct backfill milestone already existed in the data
  model; the UI just never reached for it.
- **`schedule_audit_phase` (the RPC) has no date validation at all** —
  confirmed via `pg_get_functiondef`; it accepts and stores any date. No
  server-side change was needed once the client stopped sending the invite
  side effects for a past date.
- **Carl's follow-up ("doesn't make sense to label it Schedule") was
  correct and is now reflected in the UI**, not just the data model: the
  submit button reads "Log" instead of "Schedule" whenever the selected
  date is in the past, with an inline hint explaining that logging it will
  mark the meeting completed immediately.

---

## Code changes

- **`src/components/audit/workspace/AppointmentPanel.tsx`** — removed the
  Calendar's `disabled` guard entirely; added an `isPastDate` derivation
  from the currently-selected date; submit button now reads "Log" (not
  "Schedule") for a past date, with an inline explanatory hint below the
  date field.
- **`src/hooks/useAuditSchedule.ts`** (`useScheduleAuditPhase`) — added an
  `isBackdated` check (`scheduledDate < today`). When backdated:
  auto-completes stage tasks with milestone `'conducted'` instead of
  `'scheduled'`; skips calendar-event creation and the Outlook invite
  entirely; immediately marks the `audit_appointments` row `status =
  'completed'` with `completed_at` stamped to the meeting's own
  date/time (not "now"); and — mirroring `useCompleteAuditAppointment`'s
  existing logic — transitions the audit from `draft` to `in_progress`
  when it's the opening meeting. Success toast says "logged" instead of
  "scheduled" for backdated entries.
- **`src/components/audit/workspace/ScheduleTab.tsx`** — passes
  `auditStatus: audit.status` through to the opening-meeting schedule
  call so the mutation can perform the same `draft` → `in_progress`
  check backdated entries need.

---

## Verification

- Live in the browser (dev server against the real hosted Supabase, real
  audit): opened the Opening Meeting date picker for a real audit and
  confirmed dates before today are now selectable (no longer disabled in
  the calendar grid); selected a past date and confirmed the submit button
  changed from "Schedule" to "Log", with the hint text rendering
  correctly.
- Did **not** actually submit the backdated schedule action against this
  real audit, to avoid mutating a live client record as a side effect of
  testing — the "completed immediately, no calendar invite, `'conducted'`
  milestone" branch is verified by direct code reading and `pg_get_functiondef`
  checks against the live RPC/stage-task function, not by an end-to-end
  live submission.
- `npx tsc --noEmit` clean.

---

## Decisions

- **Fixed the whole chain, not just the calendar's disabled prop.** Carl's
  own follow-up question ("doesn't make sense to label it Schedule")
  confirmed that just unlocking the date picker would have left a
  half-correct, confusing flow (a "scheduled" meeting that already happened,
  sitting in limbo until a separate manual "Complete" click, with a stray
  Outlook invite for a past date). Landing it as `'completed'` immediately
  with the right milestone and no invite is the coherent fix.
- **Reused the existing `'conducted'` milestone rather than inventing a new
  one.** It was already defined per-stage in `complete_audit_stage_tasks`
  and simply never called from this code path.
- **Did not change `schedule_audit_phase` (the RPC) itself** — it already
  accepts any date; only the client-side side effects needed to branch on
  backdating.

---

## Open questions parked

- Only `opening_meeting`/`closing_meeting` get the immediate-complete +
  Outlook-skip treatment. `document_submission_deadline` backdating still
  goes through unchanged (it never created calendar events/invites to begin
  with, so there was no equivalent side effect to guard against) — its
  auto-generated evidence-request behaviour on backdate wasn't audited
  further this session.
- Not verified end-to-end (real submission) against a live audit — see
  Verification above.
