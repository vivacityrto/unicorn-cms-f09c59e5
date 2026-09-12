# Phase 4 P6 exit re-audit — joint recommendation (Claude + Codex reconciled)

**Parent plan:** [Codebase Optimization Plan](../../codebase-optimization-plan-2026-08-28.md) · **Program index:** [Program Index](../../program-index.md)
**Inputs reconciled:** [Claude's half — fresh metrics + hotspot triage](p6-exit-reaudit-metrics-and-hotspots.md); Codex's independent RBAC v6/TOM/Client Health ownership cross-check (agent-coordination board, `phase4-hotspot-split` lane, 2026-09-11)

**Status:** joint recommendation delivered 2026-09-11. This is the reconciliation the plan's own P6 note requires before Phase 4 is declared complete — read-only, no extraction authorized by this doc itself.

## Recommendation: Phase 4's Codebase-Optimization-owned hotspot program is done. Remaining large files route to their owning initiative, not a Phase 4 slice 9+.

Of the 9 genuinely-new large-file candidates Claude's fresh metrics surfaced,
Codex's independent cross-check found **none are a clean, policy-neutral
Codebase-Optimization seam** the way slices 1-8 were. Every one either has
an existing owning initiative (TOM, RBAC, or Client Health) with its own
discovery/decision gate, or lacks any ownership claim at all and needs a
joint matrix before anyone touches it. Forcing any of them into a slice 9
would risk exactly what the plan's own routing crosswalk warns against:
duplicate characterization, conflicting definitions of "current behavior,"
or a policy change hidden inside what looks like a refactor.

## Per-file disposition

| File | Lines | Owner | Status |
|---|---:|---|---|
| `ManageTenants.tsx` | 1,493 | **TOM P0.1** (source-of-truth inventory already claims its tenant/lifecycle/access/package/contact/CSC/note reads and `connected_tenants` writes) | Not a Codebase seam. RBAC/Client Health attach as reviewers only. |
| `TenantUsersTab.tsx` | 1,654 | **Shared RBAC/TOM** — already has its own characterization doc (`client-identity-invitations-characterization.md`) | Do not re-characterize from scratch. Client Health is a downstream consumer only if a changed identity/contact projection actually feeds it. |
| `ClientStructuredNotesTab.tsx` | 1,806 | **Client Health H0** (clearest overlap: notes/action-items/comments/ClickUp data, note/activity context) | H0's current-state audit must establish source/freshness/ownership/authorization boundary first; TOM/RBAC review tenant scoping and actor permissions. Not Client-Health-owned by default assumption — H0 has to actually claim it. |
| `TasksManagement.tsx` | 1,820 | **H0 consumer/source check required** — joins `tasks_tenants`/`client_action_items`/`ops_work_items`/tenants/packages/users with tenant-scoped writes | No existing Client Health packet claims this file yet; classify as needing that check, not as already owned. |
| `AdminStageDetail.tsx` | 2,703 (2,574 per Codex's independent read — both above the plan's threshold either way) | **No existing ownership claim found by either agent.** | [Joint ownership matrix](admin-stage-detail-joint-ownership-matrix.md) now defines the shared RBAC/TOM/Client Health questions, current boundary evidence, and characterization gate before any state/query/mutation extraction. Pure UI seams can stay Codebase-owned only if the matrix clears them as genuinely policy-neutral. |
| `tga-sync/index.ts` | 2,674 | Not cross-checked by Codex this pass (Edge Function backend, out of the frontend-hotspot scope both agents were working from) | Deferred — needs its own pass if picked up later. |
| `ask-viv-assistant/index.ts` | 2,003 | Same as above | Deferred. |
| `compliance-assistant/index.ts` | 1,611 | Same as above | Deferred. |
| `AskVivPanel.tsx` | 1,490 | Not explicitly cross-checked (Codex's pass focused on the tenant/task/notes/stage cluster) | Deferred — likely low-risk (UI panel over the already-extracted chat hook) but not confirmed. |
| `AuditTemplateBuilder.tsx` (slice 7's paused remainder) | 2,319 | **RBAC/TOM** for the deferred save/submit flow (`selected_tenant_id` reads/writes, audit-template/inspection mutations) | Confirms slice 7's own pause reasoning — this was already known to be the highest-risk remaining handler; Client Health ownership not established, don't add that dependency without a real consumer link. |

## What this means for Phase 4 itself

- **Slices 1-8 are Phase 4's complete, closed scope.** No further
  Codebase-Optimization-only hotspot slice is recommended from this
  re-audit's evidence.
- The 9 new large files found by fresh metrics are **not silently
  dropped** — each has an explicit next step (an owning initiative's
  discovery/decision gate, or a joint ownership matrix), recorded here so
  they don't need rediscovering later.
- Whether to actually start any of those owning-initiative discovery
  passes (TOM P0.1 continuing into `ManageTenants.tsx`, Client Health H0
  picking up `ClientStructuredNotesTab.tsx`/`TasksManagement.tsx`, a joint
  RBAC/TOM/Client-Health matrix for `AdminStageDetail.tsx`) is a separate
  decision for Carl, not authorized by this read-only re-audit.
- The 3 Edge Function backends and `AskVivPanel.tsx` are flagged but
  genuinely unreviewed — an honest gap, not a claim either way.

## Verification

Docs-only change. `node scripts/check-kb-links.mjs` and
`node scripts/check-kb-doc-size.mjs` are the relevant checks; no
lint/typecheck/test suite applies since no code changed.
