# Audit: 2026-07-27 — action-item-notify-reminders

**Trigger:** ad-hoc (new feature build, hand-applied hotfix override)
**Scope:** Built and shipped a new feature — robust Action Item notify (internal staff list, tenant user list, configurable due-date reminders) — replacing the old single-checkbox, non-persisted notify design in `ClientActionItemsTab.tsx`. Did not touch the secondary `CreateActionDialog.tsx` entry point (reached via `StaffTaskActionMenu.tsx`) or regenerate `src/integrations/supabase/types.ts`.

## Findings
- Investigated the existing "notify" section before building: it was two unrelated, unpersisted bolt-ons — a staff multi-select that only wrote to `user_notifications` (in-app bell, via `notify-action-shared`), and a single "Notify Client (Primary Contact)" checkbox that sent one plain-HTML email via `send-composed-email`. Neither choice was ever saved on `client_action_items`; both were pure ephemeral UI state used once at creation time. There was no due-date-relative reminder capability anywhere for action items — the only similar existing pattern (`audit_send_evidence_reminders`) turned out to be dead code (calls an edge function, `send-automated-email`, that doesn't exist in the repo).
- Corrected an earlier assumption mid-session: the codebase has **both** an inline-HTML-in-code email pattern (`send-composed-email`) and a Mailgun-hosted-template pattern (`send-invitation-email`, template `unicorn_accept_invite_v1`) — not universally one or the other. Chose the inline-HTML pattern for this feature so the whole template stays in git; confirmed with the user this means no Mailgun dashboard setup is required for this feature.
- Design decisions confirmed with the user before building: (1) reminder timing is fixed presets 15/7/3/1 days before, with only offsets still reachable given the entered due date shown as selectable (recalculated live as the due date field changes); (2) the new staff/tenant recipient lists fully replace the old primary-contact-only checkbox for both the immediate creation email and the new due-date reminders (single unified recipient model).

## KB changes shipped
- No changes.

## Codebase observations (read-only prior to this session's build)
- `client_action_items` had no notify-related columns at all prior to this session — confirmed via `src/integrations/supabase/types.ts:10184-10237`.
- `notification_outbox`/`process-notification-outbox` is Teams-only (no email branch) — not usable for this feature without adding an email branch, so a dedicated new path was built instead.
- `private.cron_function_jwt()` (vault-stored secret) is the established bearer convention for `verify_jwt=false` cron-only edge functions (`process-notification-outbox`, `run-tenant-risk-forecast`) — no separate service-role vault secret exists. Mirrored this pattern for the new `send-action-item-due-reminders` function rather than inventing a new auth mechanism.

## What was built and applied
- unicorn (`unicorn-cms-f09c59e5`) @ `c4e3a027` (branch `hotfix/2026-07-27-action-item-notify-reminders`, PR [#47](https://github.com/vivacityrto/unicorn-cms-f09c59e5/pull/47), not yet merged):
  - `supabase/migrations/20260727043013_action_item_notify_reminders.sql` — adds `notify_staff_user_ids`/`notify_tenant_user_ids` (uuid[]) and `notify_offset_days` (int[]) to `client_action_items`; creates `client_action_item_reminder_log` (dedupe/audit table, unique on `action_item_id, offset_days, recipient_user_id`, RLS staff-select-only); schedules a new nightly cron `send-action-item-due-reminders-nightly` (`0 20 * * *`, ~06:00 AEST).
  - `supabase/functions/send-action-item-due-reminders/index.ts` — new cron-only edge function (`verify_jwt=false`, service-role client, no per-request caller check — same trust model as the two existing cron-only functions). Scans open action items, matches `due_date - today` against configured offsets, sends a branded reminder email per recipient via direct Mailgun call, logs each send for dedupe.
  - `src/lib/notifyActionItem.ts` — new helper for the immediate "created" email, reusing the existing authorized `send-composed-email` function per recipient rather than a new endpoint.
  - `src/components/client/ClientActionItemsTab.tsx` — redesigned notify UI (two labeled recipient groups + dynamic reminder-offset checkboxes); persists the three new columns via the same follow-up-`.update()` pattern already used for `item_type`; wires immediate email + existing in-app-bell call to the new staff list.
- Supabase (`yxkgdalkbrriasiyyrwk`) — migration applied live before being committed to git (migration version `20260727043013`); `send-action-item-due-reminders` deployed and smoke-tested via a manual `net.http_post` invocation mirroring the real cron call — returned `{"success":true,"sent":0,"skippedAlreadySent":0,"skippedNoEmail":0,"errors":[]}` (0 sent expected — brand-new feature, no items had reminders configured at test time). `get_advisors(type: security)` run post-migration: no findings against the new table.

## Decisions
- Built via direct hand-edits under the workspace `CLAUDE.md` explicit-override provision (Carl authorized in-session: "create PR and apply migrations if you have to"; for the DB apply specifically, one `apply_migration` call was blocked twice by the Claude Code auto-mode permission classifier before a retry succeeded — no attempt was made to route around the block via a different tool in the interim).
- Chose to reuse `send-composed-email` for the immediate-send path rather than building a second new edge function, since it already has correct staff/tenant-member authorization, merge-field templating, and `email_send_log` logging — reduces new surface area to one genuinely new function (the cron-only reminder scanner).
- Did not regenerate `src/integrations/supabase/types.ts` — TypeScript compiles clean regardless (verified via `tsc --noEmit`, zero errors), but the generated types are stale for the three new columns and the new table until a regen is run.
- Did not extend the secondary `CreateActionDialog.tsx`/`StaffTaskActionMenu.tsx` entry point — out of scope per the user's description of "when creating an Action Item under a client," which points at the primary `ClientActionItemsTab.tsx` flow.

## Open questions parked
- Whether `CreateActionDialog.tsx` (the secondary create-action entry point) should get the same notify redesign for consistency — not raised by the user, flagged here for a future session if parity is wanted.
- `src/integrations/supabase/types.ts` regeneration — cosmetic/type-accuracy debt, not a functional blocker.
- Next Lovable session should be made aware of this hand-applied feature (per `unicorn-kb/handoffs/lovable-to-codebase.md`) so it doesn't get silently overwritten or treated as something Lovable itself shipped.

## Tag
audit-2026-07-27-action-item-notify-reminders
