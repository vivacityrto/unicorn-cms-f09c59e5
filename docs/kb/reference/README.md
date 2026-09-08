# KB Lifecycle Registry

> **Last updated:** 2026-09-04 · **Reconsider by:** 2026-12-01 · **Confidence:** medium — status is read from each doc's own header where one exists, and inferred from content/dates otherwise; inferred rows are marked and should be treated as a starting point, not a final call.

Every long-form plan, handoff, and codebase-state doc in `docs/kb/` gets a lifecycle status here, so a reader (human or AI) can tell **"is this current instruction, or evidence of something that already happened / was decided differently / hasn't been decided yet"** without reading the whole thing.

## The four states

- **`active`** — current, load-bearing reference material. Trust it (subject to its own reconsider-by date).
- **`planning`** — a proposal or implementation plan not yet executed, or only partially executed. Do not treat as a standing instruction to act; it authorizes nothing on its own. Most plan documents explicitly say this themselves — see each one's own header.
- **`completed` / `historical`** — describes something that already happened (a shipped plan, a point-in-time audit, a dated exploration). Preserve as decision/evidence history; don't edit to make it match current reality, and don't execute it as if it were new instructions.
- **`superseded`** — a later document or the actual current source of truth has replaced this one's conclusions. Kept for the historical trail, not for current guidance.

This mirrors — and doesn't replace — the KB's own precedence rule (`reference/source-precedence.md`): when a KB doc and the codebase disagree, the codebase wins regardless of what's marked here.

## Program Map

This registry tracks the lifecycle status of *every* doc in `docs/kb/`.
For the four active cross-cutting initiatives specifically (Codebase
Optimization, RBAC v6, Tenant Operating Model, Client Health Activity
Analytics) — current status, phase, dependencies, and gates — start at
[`program-index.md`](program-index.md) instead. Phase/execution-branch
docs for the Codebase Optimization Plan live under
[`codebase-optimization/`](codebase-optimization/), not flat in this
folder — see `docs/kb/pinned/kb-hygiene.md` → "Program/phase folder
hierarchy" for the full convention.

## `docs/kb/reference/`

| File | Status | Why |
|---|---|---|
| `program-index.md` | active | New 2026-09-08. Thin canonical glue across the four initiatives — status/phase/dependencies/gates/links only. |
| `ai-audit-stack.md` | active | Reference for a shipped feature (7 AI audit Edge Functions); factually stable even though its reconsider-by date has passed. |
| `ai-use-principles.md` | active | Standing principles, not time-bound. |
| `brainstorm-log.md` | active | A running log by design — entries close out individually, the doc itself doesn't. |
| `cadence.md` | active | Needs a content refresh (cites stale `05-product-decisions.md`-era cross-references, now fixed to `decisions.md`) but the cadence description itself isn't wrong. |
| `clean-architecture-refactor.md` | superseded | Says so explicitly: "superseded as the active plan" by `codebase-optimization-plan-2026-08-28.md`. |
| `client-portal-qa-protocol.md` | active | Living QA protocol reference. |
| `codebase-optimization-plan-2026-08-28.md` | active | Phases 0, 1, and 2 are complete; Phase 2.5 is closed; Phase 2.6 stabilization is active. The plan remains the live execution ledger and authorizes no production mutation or merge by itself. Progress narrative extracted to `codebase-optimization-plan-progress-log.md` (2026-09-08). |
| `codebase-optimization-plan-progress-log.md` | active | New 2026-09-08. Extracted execution history for the optimization plan — see the plan's own header. |
| `dashboard-overhaul-mockup.md` | historical | One-off analysis snapshot (2026-07-03); its companion `.html` mockup is missing from the repo (noted in the doc itself). |
| `codebase-optimization/cross-cutting/dead-code-feature-consolidation-investigation.md` | planning | Moved 2026-09-08 (was flat, `-2026-09-04` suffix dropped). Council-reviewed candidate register and cross-program Phase 2.6 proposal; explicitly authorizes no deletion, database mutation, permission change, deployment, or merge. |
| `codebase-optimization/phase-2-6-stabilization/phase-2-6-stabilization-plan.md` | active | Moved 2026-09-08 (was `phase-2-6-stabilization-and-claude-execution-plan-2026-09-07.md`, flat). Current stabilization ledger and execution packets — P4-D (all 7 items) and P3-A closed 2026-09-08. Progress narrative extracted to the folder's own `progress-log.md`. |
| `codebase-optimization/phase-2-6-stabilization/progress-log.md` | active | New 2026-09-08. Extracted execution history for the stabilization plan. |
| `codebase-optimization/phase-2-6-stabilization/l10-real-bugs-found.md` | active | Moved 2026-09-08 (was flat, `-2026-09-04` suffix dropped). Bug evidence register — 28 items, all P4-D items now FIXED. |
| `codebase-optimization/phase-2-6-stabilization/task-dialog-characterization.md` | completed | Moved 2026-09-08 (was flat, `-2026-09-04` suffix dropped). Merged in PR #592. |
| `codebase-optimization/phase-2-6-stabilization/preparation-status.md` | historical | Moved 2026-09-08 (was flat, `-2026-09-04` suffix dropped). Superseded in practice by the stabilization plan's own truth-sync section. |
| `codebase-optimization/phase-2-6-stabilization/next-candidate-packets.md` | planning | Moved 2026-09-08 (was flat, `-2026-09-04` suffix dropped). Preparation-only, no runtime/database changes. |
| `codebase-optimization/phase-2-6-stabilization/qa-environment-and-coverage-strategy.md` | active | Moved 2026-09-08 (was flat, `-2026-09-08` suffix dropped). Live QA environment strategy, gates P1-C. |
| `codebase-optimization/phase-3/parallel-preparation-packets.md` | planning | Moved 2026-09-08 (was flat, `-2026-09-04` suffix dropped). Read-only characterization/sequencing packet. |
| `codebase-optimization/phase-3/p3-a-client-health-consumer-characterization.md` | completed | Moved 2026-09-08 (was flat, `-2026-09-08` suffix dropped). P3-A consumer containment closed via PR #1024. |
| `decision-trail.md` | active | Living ADR log — individual ADRs carry their own Decided/Superseded/Reversed status inline; the doc as a whole is the current canonical decision record. |
| `dev-guardrails.md` | active | Standing guardrails. |
| `execution-efficiency-log.md` | active | Cross-cutting cycle-time/findings data per batch across all initiatives — a running log, not a plan. |
| `flow-patterns.md` | active | Living pattern reference. |
| `migration-1to2.md` | active | Living reference for 1.0→2.0 questions; the "user ID bridge" section was corrected from "open" to "closed" in this pass. |
| `notification-system-behavior.md` | active | Living behavior reference. |
| `rbac-v6-authorization-implementation-plan-2026-09-01.md` | planning | Says so explicitly: "Implementation plan only. It authorizes no production migration..." |
| `tenant-operating-model-data-architecture-plan-2026-09-02.md` | planning | Council-reviewed implementation plan; no implementation or production mutation authorized in the planning session itself. |
| `client-health-activity-analytics-plan-2026-09-03.md` | planning | Architecturally a child of the Tenant Operating Model plan (see its own "Parent architecture" header). P3-A consumer containment closed 2026-09-08. |
| `source-precedence.md` | active | Defines the precedence rule this registry itself relies on. |
| `ui-explainer.md` | historical | Its companion `.html` walkthrough is missing from the repo (noted in the doc itself); "Regeneration" section explains how to rebuild it. |

## `docs/kb/handoffs/`

| File | Status | Why |
|---|---|---|
| `ask-viv-client-mode.md` | superseded | Marked in this pass — `compliance-assistant-client` (the function it scoped) is retired; replaced by `ask-viv-assistant-client`. |
| `ask-viv-fix-procedure.md` | active | Says so explicitly: "Reference — keep for the next time Ask Viv breaks." |
| `claude-project-to-claude-code.md` | active | Standing procedural handoff, listed in the scenario lookup. |
| `dashboard-metrics-fix.md` | planning | Says so explicitly: "Ready to implement — Phase 0 first" — not yet executed as of this registry. |
| `dashboard-overhaul-lovable-prompts.md` | historical *(inferred)* | No explicit completion marker, but the route manifest shows `MainDashboard` (the component this doc's prompts target) already live at `/dashboard` — the overhaul appears to have shipped. Verify before treating any specific prompt in it as still-pending work. |
| `email-triage-module.md` | planning | Own header: "Design decisions confirmed — ready for Prompt 2" — in progress, not shipped. |
| `eos-meeting-overhaul-plan.md` | planning | Own header: "Draft — scoping complete, design decisions open, no Lovable prompts written yet." |
| `impersonation-improvements-plan.md` | historical | Own header: "✅ All phases complete (18 Jun 2026)." |
| `lovable-production-db-change.md` | active | Standing procedural handoff, listed in the scenario lookup. |
| `lovable-to-codebase.md` | active | Standing procedural handoff, listed in the scenario lookup. |
| `non-technical-proposal.md` | active | Standing procedural handoff, listed in the scenario lookup. |
| `pdp-follow-up-prompts.md` | historical *(inferred)* | Addresses gaps in `pdp-lovable-prompts.md`; PDP is marked "✅ Shipped — Flagship #3" in `module-status.md`, so these follow-up prompts appear executed. Verify against source before assuming every individual fix (F13–F16) landed. |
| `pdp-lovable-prompts.md` | historical *(inferred)* | Original PDP build prompts; PDP is shipped per `module-status.md`. Superseded in practice by the shipped state, not by a specific later document. |
| `post-lovable-remix.md` | active | Standing procedural handoff, listed in the scenario lookup. |
| `rbac-v5-implementation-plan.md` | completed | Own header: "Shipped — all 8 phases done." Follow-on gaps tracked separately in `rbac-v6-gate-closure-plan.md`. |
| `rbac-v6-gate-closure-plan.md` | planning | Own header: "Planning only. No code or DB changes made." |
| `supabase-mcp-read-only.md` | active | Standing procedural handoff, listed in the scenario lookup. |
| `tasks-overhaul-plan.md` | completed | Own header: "✅ Complete (Phases 1–7 shipped 16–17 June 2026)." |

## `docs/kb/codebase-state/`

| File | Status | Why |
|---|---|---|
| `architecture.md` | active *(content stale)* | Carries an explicit currentness warning pointing at the optimization plan; regeneration is Phase 1 work not yet done as of this registry — see the plan §7 "Full current-state regeneration" table. |
| `audit-log-inventory.md` | active *(content stale)* | 2026-05-14 snapshot, 108+ days past its own reconsider-by date; needs a live schema re-query, not yet done. |
| `codebase-map.md` | active *(content stale)* | Same regeneration backlog as `architecture.md`. |
| `feature-matrix-2026-05-20.md` | historical | Dated point-in-time feature matrix, not maintained as a living doc. |
| `internal-staff-audit-2026-07-29.md` | historical | Dated audit snapshot from a specific Playwright pass. |
| `kpi-module-remaining.md` | active | Own header: "In progress" — a live tracking doc for remaining KPI work. |
| `kpi-module.md` | completed | Own header: "Implemented — all 7 phases complete." |
| `messaging-pipeline.md` | active | Living state doc. |
| `module-status.md` | active *(content stale)* | Same regeneration backlog as `architecture.md`/`codebase-map.md`. |
| `route-inventory-by-role.md` | active *(content stale)* | `scripts/check-route-drift.mjs` (added P0.6) already confirms this doc's route-count claim is stale (249 claimed vs. 244 live) — full table regeneration not yet done. |
| `super-admin-executive-academy-audit-2026-07-29.md` | historical | Dated audit snapshot from a specific Playwright pass. |
| `super-admin-exploration-2026-05-21.md` | historical | Dated exploration snapshot. |

## Maintaining this registry

Add a row here whenever a new long-form plan or handoff lands, and flip a status the day it's superseded, shipped, or abandoned — don't let this decay the way `handoffs/README.md`'s scenario lookup and `codebase-state/README.md`'s file list did (both listed only a subset of what actually existed; both were expanded alongside this file). Prefer a doc's own explicit status header over inference here — if you add one, update this table to match.
