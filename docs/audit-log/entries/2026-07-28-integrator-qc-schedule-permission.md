# Audit: 2026-07-28 — integrator-qc-schedule-permission

**Trigger:** ad-hoc — Carl asked to "check on" three unrelated reported issues (Clients nav unread indicator, support-ticket-resolution notification, Schedule QC unavailable for Integrator), then asked to hotfix all three directly. Only the third touched production data, which is what this entry covers.
**Scope:** A single-row `role_permissions` data change in `unicorn-cms-f09c59e5`, authored directly under Carl's standing hotfix authorization (workspace CLAUDE.md, 2026-07-23/2026-07-28 revisions — direct git hotfix is now the default path, not a per-session override). Did not go through the full Lovable-prompt phased workflow (`unicorn-kb/handoffs/lovable-production-db-change.md`) since the change was hand-written, not Lovable-generated — per that handoff's scope note, the phased-prompt steps don't apply to hand-written hotfixes, but this audit-entry requirement still does. Two sibling hotfixes shipped in the same session (nav indicator, ticket-resolution notification) are recorded below for session continuity but did not touch schema/data and would not independently warrant an audit entry.

## Findings
- `role_permissions` (created in migration `20260609052540`, the "65-feature × 6-role seed") had seeded `eos.qc.create = 'none'` for the `Integrator` unicorn_role, silently disabling the "Schedule QC" button in `EosQC.tsx` (gated by `usePermission('eos.qc.create')`).
- This directly contradicted the older, still-referenced hardcoded `useRBAC.tsx` `ROLE_PERMISSIONS` map, which already listed `'qc:schedule'` under `Integrator`. `PermissionTooltip` reads that legacy source (not `role_permissions`), so Integrators saw a disabled button with no explanatory tooltip — the two permission systems disagreed and neither side flagged it.
- No trigger auto-populates `permission_change_log` on `role_permissions` writes; the admin `RolePermissionsEditor.tsx` UI currently only reads that table (line 139) and does not appear to write to it or to the change log itself — the log table exists but nothing in the app writes to it yet. This migration is (as far as this audit found) the first real row in `permission_change_log`.
- The manager/facilitator picker in `QCScheduler.tsx` (`managerOptions`, ~line 55) independently filters to `Super Admin`/`Team Leader` only. Granting `Integrator` the `eos.qc.create` permission unlocks the button but does **not** let an Integrator select themselves as facilitator — flagged as a known follow-up, not actioned this session (out of the reported scope).

## KB changes shipped
- no changes (this is a permissions-data fix, not an architecture or documentation change)

## Codebase observations
- unicorn-cms-f09c59e5, three hotfix branches off `origin/main` (post `3ed42dc6`), all PRs opened but **not yet merged** at time of writing:
  - **PR #55** (`ef0a536c`, branch `hotfix/clients-nav-unread-indicator`) — UI-only. Extends `renderSection()` in `DashboardLayout.tsx` with an optional red-dot indicator, wired to the existing `useTeamUnreadCount`/`useMyAssignedConversationsCount`/`useSupportTicketsBadge` hooks. No schema/data touched.
  - **PR #56** (`e20556c1`, branch `hotfix/ticket-resolved-notification`) — code-only. `SuggestionDetail.tsx`'s `handleSave` now inserts a `user_notifications` row for `suggest_items.reported_by` when a ticket transitions to `resolved`, mirroring the existing `notify-suggestion-submitted` bell-notification pattern. No migration; relies on the already-permissive `user_notifications` insert RLS policy.
  - **PR #57** (`9baef364`, branch `hotfix/integrator-qc-schedule-permission`) — the DB change this audit covers. New migration `supabase/migrations/20260728074500_grant_integrator_qc_create_permission.sql`: pre-flight-checks the target row exists, updates `role_permissions` (`role='Integrator'`, `feature_key='eos.qc.create'`) from `level='none'` to `level='full'`, and inserts a matching `permission_change_log` row (before/after captured as full row JSON, reason text).
- **Applied directly to the live Supabase project (`yxkgdalkbrriasiyyrwk`) via Supabase MCP**, with Carl's explicit in-session approval (the action was first blocked by the auto-mode permission classifier, then re-approved on retry):
  - Pre-flight `SELECT` confirmed `role_permissions.id=225` (Integrator/eos.qc.create) was `'none'` before the change, matching the migration's expectation.
  - Post-apply `SELECT` confirmed `level='full'` on the same row, and `permission_change_log.id=479` recorded the before/after.
  - One follow-up correction: the migration's `reason` text originally contained an em dash (—); the live INSERT silently stored `reason = NULL` for that character (no error raised). Caught by a post-apply verification query, fixed with a direct `UPDATE` on the live row and by editing the committed migration file to use a plain hyphen instead, so the file and the live state now match.
  - `get_advisors`/broader security review was not re-run this session (single-row data UPDATE on an already-RLS-protected table, no new object created).
- `npx tsc --noEmit` passed with no errors after each of the two code-touching hotfixes (PR #55, #56). No end-to-end Playwright/browser smoke test was performed for any of the three changes this session.

## Decisions
- Integrator should have `eos.qc.create` access (i.e. be allowed to schedule QCs), matching Team Leader — confirmed with Carl before drafting the migration, since this is a permission grant, not a bug-fix-only judgement call.
- Scope was deliberately limited to the reported symptom (disabled button). The `QCScheduler.tsx` manager-picker gap (Integrator still can't be selected as facilitator) was surfaced but left unactioned pending a separate ask.

## Open questions parked
- Whether `QCScheduler.tsx`'s manager/facilitator picker should also include `Integrator` — not requested this session.
- Whether `RolePermissionsEditor.tsx` should be wired to write to `permission_change_log` when an admin edits permissions via the UI (currently a read-only display of a log nothing appears to populate) — noticed during this audit, not in scope to fix.
- The em-dash-silently-drops-to-NULL behavior on `permission_change_log.reason` inserts via the Supabase MCP `apply_migration` path is worth a mental note for future migrations authored the same way — plain ASCII in string literals avoids it; root cause (client-side encoding vs. a Postgres-side truncation) was not investigated further since the workaround was immediate and low-risk.
- All three PRs (#55, #56, #57) are open, not yet merged, at the time this audit was written — merge is a separate explicit ask per the workspace session-end ritual.

## Tag
audit-2026-07-28-integrator-qc-schedule-permission
