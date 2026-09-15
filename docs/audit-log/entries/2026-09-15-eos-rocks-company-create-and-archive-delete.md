# Audit: 2026-09-15 — `eos.rocks.company.create` catalogue fix + wired-up archive/delete

**Trigger:** Carl's dispositions on the two open findings in [P1-x](../kb/reference/rbac-v6/p1/p1-x-eos-rocks-own-manage-golden-matrix-draft.md): (1) internal staff can create rocks (no company-rock restriction), (2) `eos.rocks.own.manage` stays broad, and (3) wire up real archive/delete UI since the existing hooks were dead code.
**Scope:** `public.role_permissions` (`eos.rocks.company.create` rows), `useEosRocksHierarchy.tsx`, `useEos.tsx`, `RockCard.tsx`, `EosRocks.tsx`.

## Findings

- P1-x found `eos.rocks.company.create`'s Super-Admin/Team-Leader-only catalogue restriction had no enforcement point anywhere (UI dropdown gate didn't check `rock_level`, RLS INSERT policy didn't either). Carl confirmed the catalogue should match reality: internal staff can create rocks, no restriction.
- Carl confirmed `eos.rocks.own.manage` stays broad (matching `eos.scorecard.manage`'s precedent) — no further scope narrowing needed on `upsert_rock_with_parenting` beyond the staff-only gate added in PR #1354.
- Carl asked to wire up real archive/delete, since P1-x found both existed only as dead code (`archiveRock` in `useEosRocksHierarchy.tsx`, `deleteRock` in `useEos.tsx`'s `useEosRocks()`), with zero call sites.

## Code changes (this entry accompanies one)

- Migration `grant_eos_rocks_company_create_all_internal_roles` (already applied via Supabase MCP, committed for repo history): sets `role_permissions.level = 'full'` for `eos.rocks.company.create` for BGT/CET/CSC/Integrator, matching Super Admin/Team Leader (already `full`) and `eos.rocks.own.manage` (already `full` for every internal role). No UI/RLS enforcement gap remains to close — this brings the catalogue in line with already-live behavior rather than adding new restriction.
- `useEosRocksHierarchy.tsx`: added a real `deleteRock` mutation (hard delete) alongside the existing `archiveRock` (soft, sets `archived_at`). `deleteRock` refuses to delete a rock with children cascading from it, suggesting archive instead — matching the same defensive guard `eos.scorecard.manage`'s `deleteMetric` already uses.
- `RockCard.tsx`: added an actions dropdown (Archive / Delete, next to the existing Edit button) with a shared `AlertDialog` confirmation for both actions, explaining the consequence and — for delete — the children guard.
- `EosRocks.tsx`: wired `archiveRock`/`deleteRock` from the hook into `RockCard`'s new `onArchive`/`onDelete` props across all three rock-level tabs (Company/Team/Individual).
- `useEos.tsx`: removed the now-fully-redundant dead `createRock` and `deleteRock` exports from `useEosRocks()` (zero call sites anywhere, confirmed before removal; `updateRock` is untouched and still used by `RockProgressControl.tsx`).

## Decisions

- Archive and delete both use the same broad "any Vivacity internal staff member" authorization boundary as edit (`eos_rocks_delete`/`_update` RLS), matching Carl's "keep it broad" disposition for the row generally — no separate role tier for destructive rock actions.
- The children-guard on hard delete is a design choice made without a separate Carl ask, directly following the established precedent in the same codebase (`eos.scorecard.manage`'s `deleteMetric`) for the same class of problem (protecting cascaded/child data from an orphaning delete).
- Cascade view (`RockCascadeView.tsx`) was not wired with archive/delete in this pass — its cards use whole-card-click-to-edit, a different interaction pattern; scoped out as a smaller, separate seam if wanted later.

## Verification

- `npm run typecheck`, `LINT_RATCHET_BASE=origin/main npm run lint:ratchet`, `npm run test:frontend` — see PR for result.
- Confirmed via live query: `role_permissions` now shows `full` for `eos.rocks.company.create` across all six internal roles.
- Confirmed via grep: `useEosRocks()`'s `createRock`/`deleteRock` had zero destructuring call sites anywhere in `src/` before removal.

## Open questions parked

- Whether to also wire archive/delete into `RockCascadeView.tsx` — parked, different interaction pattern, smaller ask if wanted.
- The remaining PermissionTooltip-vs-`usePermission` vocabulary mismatch noted in P1-x (cosmetic, not security) — not addressed here.
