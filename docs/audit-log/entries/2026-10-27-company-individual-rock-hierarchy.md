# Audit: 2026-10-27 — Company to Individual Rock hierarchy

**Trigger:** ad-hoc (approved RBAC Company Rock decomposition)
**Scope:** EOS Rock hierarchy creation, normalized milestones and
`upsert_rock_with_parenting()` parent validation. Reviewed current production
relationship counts read-only for compatibility. Did not create, edit or
archive any production Rocks, apply either migration, add GitHub tasks, or
change ComplyHub KB records.

## Findings
- `eos_rocks.parent_rock_id` already represents Rock hierarchy; no new parent
  column is needed. The cascade view exposed Individual creation only below
  Team Rocks, while the Individual creation dialog only offered Team parents.
- The staff-gated SECURITY DEFINER upsert accepted a caller-supplied parent
  without checking its tenant or quarter. The proposed replacement preserves
  its existing staff gate and validates new or changed parent relationships.
- Read-only production counts showed existing Individual-to-Individual links,
  plus some existing quarter and client mismatches. The new validation is
  limited to new or changed hierarchy values so unrelated edits do not reject
  legacy records. Existing rows are not backfilled or changed.
- The current Rock milestone checklist is JSON with only text/completed state.
  Per-milestone accountability, due dates, exit criteria, evidence, and
  cross-Rock linkage need normalized rows. The proposed migration preserves
  each original JSON item as a snapshot and leaves the source column intact.
- Progress should count active Individual milestone work once through the
  hierarchy; Company checklist milestones remain the fallback until
  Individual deliverable rows exist beneath them. Deferred work is excluded
  from the active denominator.

## KB changes shipped
- no changes

## Code changes (if this entry accompanies one)
- `src/components/eos/rocks/RockCascadeView.tsx` and
  `CreateIndividualRockDialog.tsx`: expose Company as a parent option.
- `src/pages/EosRocks.tsx`: allow the Individual Rocks empty state to start
  from a Company Rock.
- `src/hooks/useEosRocksHierarchy.tsx` and `src/utils/rockRollup.ts`: route
  new Individual Rocks through the staff-gated RPC and check parent level and
  quarter in the client.
- `src/components/eos/RockFormDialog.tsx`: constrain selectable parents to the
  same quarter and compatible client scope.
- `supabase/migrations/20261027100000_validate_company_individual_rock_parenting.sql`:
  preserve the existing RPC authorization while validating new or changed
  parent tenant, quarter, archive state and level. **Not applied to production.**
- `src/types/eos.ts`, `src/integrations/supabase/types.ts`,
  `src/components/eos/RockFormDialog.tsx`: add normalized milestone fields,
  per-milestone ownership and acceptance details, evidence URL, and linking
  from Individual deliverables to Company milestones.
- `src/hooks/useEosRocksHierarchy.tsx` and
  `src/components/eos/rocks/RockCard.tsx`: calculate progress from active
  normalized milestones, counting Individual leaf work for parent Rocks.
- `supabase/migrations/20261027110000_normalize_eos_rock_milestones.sql`:
  add tenant-scoped milestone/link/event tables, validate Rock/tenant scope
  and Company-to-Individual links, record append-only change events, and
  backfill JSON milestones losslessly. **Not applied to production.**
- `src/utils/rockMilestones.ts` and the Rock create/edit flows preserve the
  legacy JSON path during staggered frontend/schema rollout; once the tables
  exist, new and edited checklist items also write normalized records.

## Verification
- Production reads only; no rows changed.
- `npm run typecheck`: passed.
- Targeted ESLint on changed TypeScript files: passed.
- `npm run lint:ratchet -- --base origin/main`: passed with no regressions.
- `git diff --check`: passed.
- `npm run check:kb-links`: passed (171 files, 1,515 local links, 0 broken).
- `npm run audit:migrations`: blocked by 14 expired entries in the existing
  migration allowlist, including the prior Rock upsert entry. No allowlist
  entry was changed as part of this scope; the report listed no separate
  finding against the new migration.
- Automated test suites and migration QA have not been run. The migrations
  have not been applied to QA or production.

## Decisions
- Reuse `parent_rock_id`; do not add another hierarchy column.
- Keep GitHub as the future actionable task record. This change does not add
  webhook synchronization or create task issues.
- Keep the proposed Individual Rocks as drafts until Carl reviews the scope
  and owner mapping. No production Rock rows have been created.
- Retain `eos_rocks.milestones` as a compatibility source; the normalized
  schema is additive. Milestone history is captured by database triggers and
  is read-only to authenticated clients.

## Open questions parked
- Both migrations need their normal review and QA/application path before
  their database behavior is active.
- GitHub issue links/webhook synchronization remain deferred until the owner
  approves the resulting Individual Rock breakdown and requests task workflow.
