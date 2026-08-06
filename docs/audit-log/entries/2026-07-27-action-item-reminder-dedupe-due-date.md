# Audit: 2026-07-27 — action-item-reminder-dedupe-due-date

**Trigger:** drift-surfaced (Carl asked what happens to the notify email when a due date changes — investigation surfaced a real dedupe gap)
**Scope:** Fixed a due-date-awareness gap in the reminder dedupe log from the same-day notify feature (audit/2026-07-27-action-item-notify-reminders.md, PR #47). Both a migration and an edge function redeploy; no frontend changes.

## Findings
- Traced the actual deployed cron logic before answering rather than describing intended behaviour: `send-action-item-due-reminders` recomputes `days until due` fresh every night from whatever `due_date` currently sits on the row — it has no memory of what the due date was when reminders were configured. So ordinary due-date edits (pushed out, pulled closer) already worked correctly with zero code changes needed: pulling a due date into range of a not-yet-sent offset correctly fires on the next nightly run.
- Real gap found: the dedupe log (`client_action_item_reminder_log`) was keyed only on `(action_item_id, offset_days, recipient_user_id)` — no `due_date`. If a due date bounced (pushed out, then later pulled back to land on the same offset a second time — e.g. "3 days before" — for what is genuinely a different due date), the existing log row would silently suppress the resend, since the system had no way to distinguish "already sent for this due date" from "already sent for some earlier due date."
- Confirmed the table was empty (0 rows) before applying the fix — no backfill/migration-of-existing-rows concern, this was a schema gap on a feature that had shipped hours earlier and not yet accumulated real sends.

## KB changes shipped
- No changes.

## Codebase observations (read-only prior to this session's fix)
- `client_action_item_reminder_log`'s original unique constraint (auto-named `client_action_item_reminder_l_action_item_id_offset_days_re_key`) covered `(action_item_id, offset_days, recipient_user_id)` only — confirmed via `pg_get_constraintdef` before dropping/replacing it, rather than guessing the constraint name.

## What was fixed
- unicorn (`unicorn-cms-f09c59e5`) @ `7a240ad8` (branch `hotfix/2026-07-27-action-item-reminder-dedupe-due-date`, PR [#49](https://github.com/vivacityrto/unicorn-cms-f09c59e5/pull/49), not yet merged):
  - `supabase/migrations/20260727050623_action_item_reminder_dedupe_by_due_date.sql` — adds `due_date date NOT NULL` to `client_action_item_reminder_log`, drops the old 3-column unique constraint, adds a new 4-column one including `due_date`.
  - `supabase/functions/send-action-item-due-reminders/index.ts` — dedupe lookup and insert both now include `due_date`, keyed against the item's *current* due date at scan time.
- Supabase (`yxkgdalkbrriasiyyrwk`) — migration applied live (table confirmed empty first); function redeployed and smoke-tested via the same manual `net.http_post` cron-style invocation used for the original deploy, returned `{"success":true,"sent":0,...}` matching expected behaviour (no items currently due).

## Decisions
- Fixed via direct hand-edit under the same explicit in-session override as the earlier PRs this session (#47, #48) — Carl's "yes go ahead" after the fix was proposed and explained.
- Chose to include the full `due_date` value in the dedupe key (rather than e.g. a "version" counter or clearing old log rows on due-date change) — simplest option that's correct by construction: two different due dates are never treated as the same send, and the same due date is still deduped exactly as before.

## Open questions parked
- None new — same parked items as the earlier two entries today (secondary `CreateActionDialog.tsx` entry point not touched, `types.ts` not regenerated).

## Tag
audit-2026-07-27-action-item-reminder-dedupe-due-date
