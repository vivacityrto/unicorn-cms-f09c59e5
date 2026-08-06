# Audit: 2026-07-30 — Package burndown view fix (direct migration)

**Trigger:** ad-hoc, surfaced during a full Playwright + Supabase audit of the Client page and Client Detail (all 13 tabs, package stage progression, burndown) that Carl asked for, followed by an in-session request to implement the fixes found.
**Scope:** Fixed 1 confirmed DB bug (this entry). A larger set of frontend-only Client Detail bugs found in the same audit shipped separately as a hand-applied hotfix, no schema/data touched — not covered here per standing policy.

## Findings

- `v_package_burndown` (the view backing the Client Detail > Time tab's "Package Burndown" cards) never joined `time_entry_allocations`. It summed raw `time_entries.duration_minutes` grouped by `time_entries.package_id` (a column that, despite the name, stores the same value as `package_instance_id` — confirmed by direct inspection, not a naming bug in itself) — but any time entry that had been split or reallocated across packages via `time_entry_allocations` was invisible to it.
- Verified live on SHCS Academy (tenant 7408): Sapphire CRICOS Membership showed **0:00 / 63:00 used** on screen while `fn_package_used_minutes()` — the same function `package_instances.hours_used` is kept in sync with via the existing `trg_recalc_package_hours_used` trigger — reported **47.75h**. Sapphire RTO Membership showed 10:20/56:00 against an authoritative 47.68h.
- Sized the blast radius before touching anything: **28 of 91 active package instances** (31%) were affected, understated by **978 minutes (~16.3h) on average**, worst case a full package showing 0 used.
- Distinguished this from a red herring first: `package_instances.hours_used` itself (surfaced on the Packages tab) is correct — it's independently trigger-maintained from `fn_package_used_minutes()` and matched that function exactly in every case checked. The bug is isolated to this one view.
- Fix mirrors `fn_package_used_minutes()`'s own pattern: sum `time_entry_allocations.allocated_minutes` for entries that were reallocated, falling back to raw `time_entries.duration_minutes` for entries with no allocation row, both filtered to `is_billable = true` and `work_type <> 'carry_over'` for consistency with that function (confirmed zero `carry_over` rows exist anywhere in prod, so this addition is a no-op safety net, not a behaviour change). The view's existing renewal-year windowing (its whole reason for being distinct from the lifetime `hours_used` figure) was preserved unchanged.
- Dry-run verified against a CTE reproducing the corrected logic before writing the migration: matched expectations on tenant 7408 (Sapphire CRICOS 0→565 min, Sapphire RTO 620→565 min — the latter dropping slightly because the old value was itself an artefact of the broken join, not a real number worth preserving) and produced no negative, null, or otherwise implausible values across all 91 active instances.
- Route taken: **direct hand-written migration**, not a Lovable prompt (matches the standing session default per workspace CLAUDE.md — direct git hotfix is now the normal path for `unicorn-cms-f09c59e5`). The phased Lovable-prompt workflow doesn't apply, but this audit entry does per the standing KB policy for schema changes regardless of route.
- An auto-mode permission classifier blocked the first `apply_migration` call; Carl explicitly confirmed applying directly via Supabase MCP (over the alternatives of leaving it for CI's `supabase db push` on merge, or holding off entirely) before it was retried and applied.

## KB changes shipped

- No changes.

## Codebase observations (read-only)

- `unicorn-cms-f09c59e5` @ `d727bf42` (branch `hotfix/stage-status-and-package-refresh-bugs`, PR #89, open awaiting Carl's merge): migration `20260730020000_fix_package_burndown_view_allocations.sql`, committed in the same PR as (but as a separate commit from) a bundle of unrelated frontend-only Client Detail fixes from the same audit session (stage status resolver race, package-refresh wiring, duplicate-package expand-key collision, 3 broken PostgREST embeds, N+1 count batching, tab URL sync, `core_complete` progress counting, `dd_status` code 7 icon, date locale) — none of those touch schema or data, so they're not detailed further here.
- Migration applied directly to prod Supabase (project `yxkgdalkbrriasiyyrwk`) via the Supabase MCP tool before the PR was opened, with Carl's explicit approval. Verified live post-migration: `v_package_burndown` for tenant 7408 now returns 565 min used for both Sapphire packages (matching the dry-run); a prod-wide check across all 91 active instances found 0 negative and 0 null `used_minutes` values.
- Did not re-run Supabase security advisors this session — the change is a `CREATE OR REPLACE VIEW` with no RLS/permission surface change (the view had no security-definer semantics before or after), judged low-risk enough to skip given the advisors check already run twice this week on adjacent changes.

## Decisions

- No ADRs drafted or resolved this session.

## Open questions parked

- **Bot review findings (Cursor Bugbot, Vercel Agent Review) on PR #89** were still pending when the PR was opened; not blocking (no required CI gate depends on them), but worth a follow-up pass once they land in case they surface something real.
- The other 3 broken-PostgREST-embed bugs found in the same audit (all confirmed missing FKs, not just this migration's target) were fixed client-side with two-step fetches rather than by adding the missing FK constraints — consistent with how the equivalent findings in `audit-2026-07-29-fk-relationships-and-tga-status-fix` were handled by adding FKs instead. Worth deciding, at some point, whether this repo's convention should default to "add the FK" vs "work around it in the query" — currently inconsistent across sessions.

## Tag

audit-2026-07-30-package-burndown-view-fix
