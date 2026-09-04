# Phase 3–5 Parallel Preparation Packets

> **Status:** read-only characterization and sequencing packet; no runtime,
> schema, RLS, RPC, trigger, grant, or Edge contract changes are authorized
> by this document.
> **Prepared:** 2026-09-04
> **Branch-cut:** `origin/main@237d7de9`
> **Parent plan:** [Codebase Optimization and KB Renewal Plan](codebase-optimization-plan-2026-08-28.md)
> **Alignment:** [RBAC v6 Authorization Plan](rbac-v6-authorization-implementation-plan-2026-09-01.md),
> [Tenant Operating Model](tenant-operating-model-data-architecture-plan-2026-09-02.md)

## Purpose

This packet makes useful progress while Claude completes Phase 2.5 without
competing for the shared heavyweight-command lane. It records what can be
characterized now, what must wait for an architecture or authorization gate,
and the smallest implementation unit that should follow each gate.

## Current coordination state

- Phase 2.5 remains active; the latest merged package-builder cluster is PR
  #594. The repo-wide `no-explicit-any` exit gate is not yet reached.
- Phase 2.6 dead-code retirement cohorts and Audit UUID convergence are
  merged. The next runtime cohort is the task-dialog consolidation packet,
  which remains gated on the Phase 2.5 exit checkpoint.
- No Phase 2.6 implementation is performed by this preparation packet.
- Heavy commands remain serialized through
  `UNICORN-PHASE-LOCK\with-heavy-lock.ps1`; preparation uses source/history
  inspection only.

## Packet A — Phase 3 boundary pilot: Lifecycle Checklists

### Evidence

- `/admin/lifecycle-checklists` is a live lazy route in
  `src/routes/dashboardRoutes.tsx` and renders `LifecycleChecklistsAdmin`.
- `src/hooks/useLifecycleChecklists.ts` is 170 physical lines and is imported
  by the page plus three lifecycle components. It currently owns interfaces,
  Supabase reads/writes, React Query configuration, invalidation, and toasts.
- The hook has three dropdown queries, one template query, and create/update/
  deactivate mutations. The dropdown helper and template operations use
  unchecked table-name casts because generated-schema coverage is incomplete
  or stale; this is a type-boundary discovery, not permission evidence.

### Smallest safe pilot

1. Characterize the admin page's list, filter, create, edit, deactivate,
   loading, empty, and error behavior with focused fixtures.
2. Verify the live table columns and mutation permissions against generated
   types and the hosted catalog before changing the cast boundary.
3. Extract only a feature query/mutation API and pure types if the result is
   smaller or materially easier to test. Do not add a generic four-layer
   architecture mechanically.
4. Preserve the existing route guard and current toast/error behavior.

### Gate

This can become the first Phase 3 implementation only after the Phase 2.6
task-dialog cohort is complete (or explicitly re-sequenced) and the RBAC
decision core has an agreed vocabulary for admin capability checks. No new
tenant or cross-tenant access surface is implied by this pilot.

## Packet B — Phase 3 platform seams: auth and permission vocabulary

### Evidence

- `src/hooks/useAuth.tsx` (206 lines) combines session state, profile loading,
  memberships, RBAC helpers, navigation, and recovery timing.
- `unicorn_role` remains spread across 160 files at this branch cut. Raw role
  checks coexist with helper and permission APIs.
- The RBAC v6 plan requires a server decision core and explicit staff-scope
  decision before route/navigation cutover. Optimization must not create a
  second permission registry.

### Preparation only

Build a caller matrix of identity class, capability, tenant scope, failure
state, and current enforcement location. The first implementation should be a
shadow/read-only decision adapter or one bounded route-family pilot, not a
global replacement of role checks. Treat RLS and server enforcement as
independent evidence that browser behavior cannot prove.

## Packet C — Phase 4 reliability candidates

Prioritize design packets, not LOC extraction:

1. **Package usage/renewal:** `usePackageUsage.tsx`,
   `usePackageUsageQuery.tsx`, `ClientTimeTab.tsx`, renewal dialogs, and
   `rpc_get_package_usage` use overlapping calculations. First produce a
   parity table for allocations, carry-in, boundary dates, and renewal
   windows. Any transactional command, lock, or RPC change requires its own
   audited vertical slice.
2. **Messaging participants/broadcast:** map eligibility, tenant binding,
   notification fan-out, attachment metadata, idempotency, and retry outcomes
   before consolidating callers. Missing-auth-user and cross-tenant cases are
   mandatory fixtures.
3. **Document lifecycle:** inventory document/version/current-pointer,
   generation, delivery, SharePoint, and job-resume owners. Do not merge
   aggregates or retire flags until compatibility projections and resumability
   are demonstrated.

These candidates align with the tenant plan's expand/migrate/compare/canary
mechanics and RBAC v6's vertical-slice enforcement. They are not approved for
schema or production changes in this packet.

## Packet D — Phase 5 Edge consistency

`extract-note-title` (137 lines) and `extract-suggest-title` (133 lines) are
the first bounded clone candidate, but they are public Edge contracts. Source
evidence shows both require an authenticated token, accept `{ content }`,
truncate input to 2,000 characters, return `{ title }`, cap titles at ten
words, and fail soft with HTTP 200 for provider/configuration failures. Their
system prompts intentionally differ, and they have separate callers.

Before extraction, add contract fixtures for OPTIONS/CORS, missing/invalid
auth, short content, provider 429/402/other failures, malformed tool output,
plain-text fallback, and the exact response envelope. Preserve both endpoint
names and auth behavior; a shared internal helper must not broaden tenant or
staff access. This is a Phase 5 Edge slice, not a frontend dead-code removal.

## Metrics checkpoint

Measured with `scripts/architecture-metrics.mjs` in a clean detached worktree
at `237d7de9`:

| Measure | Value |
|---|---:|
| Tracked product files | 1,735 |
| Physical product lines | 492,384 |
| Lines excluding generated types | 418,920 |
| Product lines excluding generated types/tests | 408,210 |
| Files over 600 / 1,000 lines | 117 / 33 |
| Wrapper files / lines | 7 / 116 |
| Direct Supabase calls (pages/components/hooks) | 95 / 178 / 240 |
| Zod-adoption files | 12 |
| Files mentioning `unicorn_role` | 160 |
| Raw `any` keyword hits | 2,840 |

The 2-line physical-LOC increase versus the prior checkpoint is ordinary
documentation/source drift at the newer main SHA, not evidence of a product
regression. These metrics are a baseline for later before/after comparisons,
not acceptance targets for a single packet.

## Efficient execution order

1. Claude completes Phase 2.5 and records the final scan, verification, and
   Playwright evidence.
2. Codex implements the already-characterized Phase 2.6 task-dialog cohort.
3. While that runs, keep Packets A–D read-only and update caller/evidence
   matrices as source changes land.
4. After Phase 2.6, run the Phase 3 Lifecycle pilot only if the RBAC gate is
   satisfied; otherwise continue characterization.
5. Run Phase 4 design gates before any transactional/schema work, then Phase
   5 Edge contract batches by response/auth family.

Every implementation PR retains the full lint, typecheck, frontend/Edge test,
build, and risk-based Playwright contract, followed by metrics, plan/log/
`MEMORY.md` updates and exact-worktree cleanup.
