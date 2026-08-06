# Audit: 2026-07-27 — action-item-notify-edit-support

**Trigger:** drift-surfaced (Carl asked directly whether editing an action item and enabling notify would work — it wouldn't have)
**Scope:** Fixed a gap in the same-day Action Item notify feature (audit/2026-07-27-action-item-notify-reminders.md, PR #47): the notify redesign only wired persistence + immediate email into the create path, not edit. Purely frontend; no DB/migration changes.

## Findings
- Traced the actual code before answering rather than assuming: `handleOpenEdit` in `ClientActionItemsTab.tsx` never populated `notifyStaffUserIds`/`notifyTenantUserIds`/`notifyOffsetDays` from the existing item's saved columns, and the edit branch of `handleSave` never persisted or acted on them at all. The notify UI was visually present in edit mode (not hidden) but toggling it and saving was a silent no-op — no error, no effect, easy to miss.
- Root cause: the `ActionItem` TypeScript interface (`useClientManagementData.tsx`) didn't declare the three `notify_*` columns added in the same-day migration, even though the fetch already used `select('*')` and the data was present at runtime — just untyped, so nothing in the edit path could reference it without a type error.

## KB changes shipped
- No changes.

## Codebase observations (read-only prior to this session's fix)
- Confirmed `client_action_items` fetch in `useClientActionItems` (`useClientManagementData.tsx:500-503`) is `select('*')`, so the new notify columns were already coming back in every fetch — the gap was entirely in the frontend not knowing/using them for edit, not a missing query.

## What was fixed
- unicorn (`unicorn-cms-f09c59e5`) @ `b943d8f3` (branch `hotfix/2026-07-27-action-item-notify-edit-support`, PR [#48](https://github.com/vivacityrto/unicorn-cms-f09c59e5/pull/48), not yet merged):
  - `ActionItem` type extended with `notify_staff_user_ids`, `notify_tenant_user_ids`, `notify_offset_days`.
  - `handleOpenEdit` now loads these into state and snapshots the originals.
  - `handleSave`'s edit branch persists all three columns on save, and emails/in-app-pings only the recipients newly added since the snapshot (diffed), not everyone already on the list — avoids re-notifying people on every unrelated edit.
  - `notifyActionItemCreated` (`src/lib/notifyActionItem.ts`) gained a `context: 'created' | 'added'` parameter so a newly-added-on-edit recipient gets correctly-worded copy ("you've been added to...") instead of the "new action item created" phrasing.
  - Also fixed, found incidentally while doing this: a previously-selected reminder offset that's no longer reachable (due date moved closer since it was set) rendered disabled *and unremovable* — now still togglable for removal if already selected, only newly adding an unreachable offset is blocked.
- No production DB changes — the nightly reminder cron (`send-action-item-due-reminders`) already reads the live notify columns regardless of whether set at creation or via edit, so no migration or edge function change was needed for reminders to start working off edited items.

## Decisions
- Fixed via direct hand-edit under the same explicit in-session override as #47 (Carl: "create PR and apply migrations if you have to" from earlier in the session covers this follow-up; no new DB change required so no fresh apply_migration call was needed).
- Chose a diff-against-snapshot approach (only notify newly-added recipients) rather than either (a) never re-notifying on edit, or (b) re-notifying everyone on every save — (a) would silently fail the exact scenario Carl asked about, (b) would spam existing recipients on unrelated edits (e.g. just changing priority).

## Open questions parked
- None new — same parked items as audit/2026-07-27-action-item-notify-reminders.md (secondary `CreateActionDialog.tsx` entry point not touched, `types.ts` not regenerated).

## Tag
audit-2026-07-27-action-item-notify-edit-support
