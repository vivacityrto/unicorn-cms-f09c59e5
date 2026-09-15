# Audit: 2026-09-15 — System Account role + staff-picker hygiene sweep

**Trigger:** ad-hoc, surfaced while investigating an `eos.rocks.own.manage` permission gap for the deprecated `Team Member` role
**Scope:** `public.users.unicorn_role`/`is_system_account` for 3 non-human accounts; every frontend query filtering by `VIVACITY_STAFF_ROLES`/`TRIAGE_ROLES` for staff-picker purposes

## Findings

- While checking why `eos.rocks.own.manage` had no `role_permissions` row for `Team Member`, found the row was correctly following the existing role catalogue: `public.dd_unicorn_roles.Team Member.is_active = false`, and `src/lib/roles/vivacityRoles.ts`'s `VIVACITY_STAFF_ROLES` already comments it `// transitional — retiring, kept for backward compat`. Team Member is deliberately deprecated already — expanding its permissions would have been the wrong fix. Carl confirmed this reading and asked to migrate the 8 accounts holding `Team Member` instead.
- Of those 8: 5 real named-person accounts (Carlo Legada, Xenia Gadayan, Ian Baterna, Jonathan Baredo, Albert Trumata) were already `archived: true, disabled: true` — no longer valid, no action needed beyond what's already in place.
- The remaining 3 are non-human accounts Carl categorized as a **system account role**:
  - `admin@vivacity.com.au` — generic admin utility account (already archived/disabled).
  - `angela+invitetest@vivacity.com.au` — a test account, still active (not archived/disabled).
  - `bulk-generate-automation@vivacity.com.au` — a **live production automation identity**. It authenticates every staff-gated downstream call in `bulk-generate-documents-worker` (SharePoint provisioning, governance document delivery, stage repair). Its actual required capability (`admin.documents.bulk_generate`) is already granted through a separate, purpose-built **supplemental** role (`user_roles` → `"Bulk Generate Automation"`, its own `role_permissions` row) — its primary `unicorn_role` was vestigial for that function.
- Three-seat council review (Auth/security, Supabase/schema, Frontend) found no blocker: `unicorn_role` is plain `text` (no enum migration risk), the `dd_unicorn_roles`/`user_roles` supplemental-role pattern already exists and is proven (used once already for the automation account), and no code anywhere does a literal role-string check keyed to these 3 specific accounts.
- Separately, Carl asked to check whether staff/internal-user pickers reliably exclude system accounts, suspecting the existing filter isn't applied consistently. Confirmed: `get_vivacity_team_directory_staff()` (the `SECURITY DEFINER` RPC behind `useVivacityTeamUsers`, ~35 consumers) already filters `is_system_account = false` correctly. But **8 separate frontend files** each hand-roll their own `.from('users').in('unicorn_role', [...VIVACITY_STAFF_ROLES])` query (a copy-pasted pattern, not the shared hook) and had **no** `is_system_account` filter at all: `useTriageStaffOptions.ts`, `useTenantTeamUsers.tsx`, `StageNotesTab.tsx`, `useAccountabilityChart.tsx`, `useCalendarShares.tsx`, `useSeatSuccession.tsx`, `TenantNotes.tsx`, `ClientActionItemsTab.tsx`. Three other ad-hoc query sites (`useAuditWorkspace.ts`, `NewAuditModal.tsx`, `ClientMessagesTab.tsx`) already had the filter, confirming the gap was inconsistent application, not a missing concept.

## Code changes (this entry accompanies one)

- Migration `add_system_account_role_and_reclassify` (already applied via Supabase MCP, committed for repo history):
  - New `dd_unicorn_roles` row: `System Account` (`is_active: false` — never selectable for a real invite, matching the existing `Bulk Generate Automation` precedent; `is_internal: true`).
  - `admin@vivacity.com.au`, `angela+invitetest@vivacity.com.au`, `bulk-generate-automation@vivacity.com.au`: primary `unicorn_role` → `System Account`, `is_system_account` → `true`. No `role_permissions` rows added for `System Account` itself (least-privilege default).
  - `bulk-generate-automation`'s supplemental `Bulk Generate Automation` role/permission is untouched — its real capability is unaffected.
- Added `.eq('is_system_account', false)` to all 8 gapped query sites, matching the pattern already proven correct in the 3 sites that already had it.

## Decisions

- `Team Member` is not touched further here — it stays in the catalogue (inactive) for historical/backward-compat reasons per the existing comment; no new permission rows were added for it.
- The bigger structural fix — consolidating all ~11 query sites onto the existing `get_vivacity_team_directory_staff()`-backed `useVivacityTeamUsers()` hook so this class of gap can't recur — is recommended but **not done here**, since some consumers (e.g. `useTriageStaffOptions`) intentionally want a narrower role subset than "all Vivacity staff," making this a real product-behavior question, not a drop-in swap. Parked as a named follow-up.
- `InviteUserDialog.tsx` still lists `Team Member` as a selectable option and even defaults new invitations to it, despite the catalogue marking it inactive — flagged as a separate, not-yet-fixed follow-up.

## Verification

- `npm run typecheck` — clean.
- `LINT_RATCHET_BASE=origin/main npm run lint:ratchet` — 0 regressions (8 files).
- `npm run test:frontend` — 582 passed / 43 skipped, full suite green.
- Live Playwright (Super Admin, isolated dev server + worktree): `/eos/accountability` (one of the 8 patched surfaces) loads with real seat/function data and 0 console errors, confirming the added filter clause executes correctly against the live schema. The other 7 surfaces share the mechanically identical pattern and were not each individually live-verified.

## Open questions parked

- Whether to pursue the bigger consolidation onto `useVivacityTeamUsers()` now or later — Carl's call.
- `InviteUserDialog.tsx`'s stale `Team Member` default.
- Whether `angela+invitetest@vivacity.com.au` (a live test account) should also be `archived`/`disabled` now that it's reclassified — not changed here, since Carl's instruction was specifically about role categorization, not lifecycle state.
