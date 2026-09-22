# RBAC v6 — Claude pause/resume handoff

> **Last updated:** 2026-09-16
> **Status:** paused for Carl's temporary ComplyHub focus; no RBAC v6 implementation is currently in flight
> **Owner:** Claude Code for RBAC v6; Codex owns TOM; Academy Solo is a separate delivery workstream
> **Authority:** [RBAC v6 master plan](../../rbac-v6-authorization-implementation-plan-2026-09-01.md) and [Program Index](../../program-index.md)

This is the restart point for the next session that returns to Unicorn's
RBAC v6 lane. It records current truth and the next bounded action without
reopening the four already-confirmed golden-matrix rows or re-litigating the
security fixes made while tracing them.

## Resume in this order

1. Read the [Program Index](../../program-index.md) (RBAC v6 row + Active
   work row), this handoff, and the
   [RBAC v6 master plan](../../rbac-v6-authorization-implementation-plan-2026-09-01.md).
2. Read [P1-e (bundled-verb decomposition)](p1-e-bundled-verb-decomposition.md)
   for the `admin.vector.manage` scoping note and Carl's standing decision on it.
3. Read the four confirmed-golden packets for the format to follow:
   [P1-w](p1-w-eos-scorecard-golden-matrix-draft.md) `eos.scorecard.manage`,
   [P1-x](p1-x-eos-rocks-own-manage-golden-matrix-draft.md) `eos.rocks.own.manage`,
   [P1-y](p1-y-eos-configurations-manage-golden-matrix-draft.md) `eos.configurations.manage`,
   [P1-z](p1-z-admin-permissions-manage-golden-matrix-draft.md) `admin.permissions.manage`.
4. Treat current source, merged PRs, and linked audit entries as truth. Do
   not infer a new hosted write, migration, schema/RLS change, or credential
   action from this handoff.
5. Open a fresh dedicated branch from current `origin/main` for any new
   implementation or documentation change. Update the relevant KB and audit
   record when evidence or status changes.

## Completed baseline

The following is complete and should not be repeated:

- All 15 RBAC v6 §13 items are dispositioned (item 1 permanently decided
  2026-09-11 via ADR-030; items 2-13 baselined 2026-09-10; items 14/15
  parked).
- Packet P0.1 and the broad P1 preparation set through P1-u are delivered.
- Four vertical slices confirmed golden by Carl on 2026-09-15: P1-w
  (`eos.scorecard.manage`), P1-x (`eos.rocks.own.manage`), P1-y
  (`eos.configurations.manage`), P1-z (`admin.permissions.manage`).
- Tracing those four slices surfaced and fixed a chain of real, same-day
  security gaps in core authorization primitives — all merged and, as of a
  full CI redeploy dispatched this session, confirmed live:
  - `SECURITY DEFINER` RLS-bypass in `upsert_rock_with_parenting` (PR #1354).
  - Disabled/archived-account bypass in `is_super_admin_safe`/
    `has_permission`/`check_permission` (PR #1363).
  - Same class of gap in `is_tenant_parent_safe`/`has_tenant_admin_safe`,
    found via a Codex-requested RBAC review of TOM's replacement invitation
    path (PR #1366).
  - A 4-instance sweep of a dead `profile.state` account-status comparison
    (`public.users.state` is `bigint` — Australian state/territory
    reference data, not account status) across `verifyAuth`,
    `ask-viv-access.ts`, `requireCaller.ts`'s `requireSuperAdmin`, and
    `backfill-vimeo-durations` (PRs #1370, #1380).
  - See `docs/audit-log/INDEX.md`'s 2026-09-15 entries for full detail on
    each.
- Built a CI-based Edge Function auto-deploy system replacing the
  unreliable native Supabase dashboard GitHub-sync integration:
  `.github/workflows/deploy-edge-functions.yml` +
  `scripts/select-affected-edge-functions.mjs` (PRs #1382/#1383). It follows
  shared-file import dependencies transitively (matching Deno's own bundler
  resolution), so a future fix to a widely-used shared file redeploys every
  real importer automatically — this is now documented as the standard
  deployment path in `AGENTS.md` → "Supabase deployment workflow." Manual
  dispatch (`gh workflow run deploy-edge-functions.yml [-f functions=...]`)
  is available for ad-hoc catch-up deploys.
- Docs reconciled and merged: `program-index.md`'s RBAC v6 rows, the
  `p1-e-bundled-verb-decomposition.md` `admin.vector.manage` note, and this
  session's audit entries — [PR #1387](https://github.com/vivacityrto/unicorn-cms-f09c59e5/pull/1387).

## Next bounded RBAC v6 task

Draft the golden-matrix packet for the fifth vertical-slice candidate,
`admin.vector.manage`, following the exact P1-w/x/y/z format:

- Carl already decided its shape: **hard-Super-Admin-locked, no
  exceptions.** This is not an open design question — it's the thing to
  verify fresh against live state, not to re-decide.
- Verify that decision against live RLS, `role_permissions`, and the Edge
  Function auth gate for `vector-search` and any other consumer, the same
  way the four completed slices were verified (not just re-asserting the
  prior conclusion).
- This was scoped but not drafted last session — investigation was
  interrupted mid-way by the `verifyAuth` security finding above, which took
  priority as a live production bug.
- Once drafted, present it to Carl for confirmation before it's added to the
  Active-work row as a fifth golden row (same approval pattern as P1-w/x/y/z).

This is a read-only investigation + drafting task. It does not authorize any
new hosted write, migration, schema/RLS change, or credential action.

## Held facts and non-goals

- Capability rows, role defaults, pilot, shadow telemetry, grants, hosted
  runs, and enforcement remain preparation-only, not approved — see the
  [remaining gated approval packet](../../codebase-optimization/cross-cutting/remaining-gated-approval-packets-2026-09-12.md).
- Do not touch TOM implementation, its ghost-activation retirement, or its
  P0.2/P0.3 evidence review — Codex owns that lane; see its own
  [pause/resume handoff](../../tenant-operating-model/p1/tom-codex-pause-resume-handoff-2026-09-16.md).
- Do not re-diagnose or redeploy the four security fixes above unless new
  evidence (a fresh finding, a failed live check) creates a genuinely new
  decision — they are confirmed merged and live.
- Disabling Supabase's native dashboard GitHub-sync integration (Project
  Settings → Integrations → GitHub) remains recommended but not actionable
  from a coding session — flagged for Carl, still outstanding.
- Building actual Deno CI type-checking for `supabase/functions/**` (the
  structural fix for the `profile.state`-type-mismatch class of bug) remains
  a deferred follow-up, not started.

## Stop conditions on return

Stop and bring the question to Carl if the next step would require a new
product/policy choice, a security disposition beyond what's already
decided, a credential-scope change, a destructive or hosted production
action, a migration/schema/RLS change, or a change to ownership between
RBAC v6 and TOM. Drafting and verifying the `admin.vector.manage` packet
against live read-only state, and routine documentation reconciliation, may
continue under the existing scope.
