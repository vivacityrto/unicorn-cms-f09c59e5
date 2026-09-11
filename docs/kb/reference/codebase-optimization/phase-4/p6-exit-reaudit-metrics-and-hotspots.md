# Phase 4 P6 exit re-audit — Claude's half: fresh metrics + hotspot triage

**Parent plan:** [Codebase Optimization Plan](../../codebase-optimization-plan-2026-08-28.md) · **Program index:** [Program Index](../../program-index.md)

**Status:** Claude's half delivered 2026-09-11. Codex's half (RBAC v6/TOM/Client
Health ownership cross-check on the genuinely-new candidates below) is a
separate, parallel deliverable — see the coordination board,
`phase4-hotspot-split` lane, for Codex's findings once posted. This doc does
not itself declare Phase 4 complete; the plan requires both halves
reconciled into one joint exit recommendation first.

**Evidence:** `node scripts/architecture-metrics.mjs` at `origin/main@15c0eaa45`
(after slice 8's close), 2026-09-11.

## Fresh baseline (`npm run metrics`)

| Metric | Value |
|---|---:|
| Tracked product files | 1,800 |
| Physical lines | 485,295 |
| Files over 600 lines | 115 (112,314 lines held) |
| Files over 1,000 lines | 32 |
| Frontend direct Supabase calls (pages/components/hooks) | 90 / 171 / 253 |
| `any` keyword hits | 327 |
| `unicorn_role` appears in | 161 files |

This re-measurement is the plan's own required input for the exit gate — not
compared against the 28 Aug baseline here (different phases have changed
too much for a clean diff to be meaningful); the point is a fresh, current
number, which this is.

## Top 15 largest files — triaged against Phase 4's own history

| # | File | Lines | Disposition |
|---|---|---:|---|
| 1 | `src/pages/AdminStageDetail.tsx` | 2,703 | **Genuinely new** — the plan's own named omission from slices 5-8. Not touched by any Phase 4 slice. |
| 2 | `supabase/functions/tga-sync/index.ts` | 2,674 | Genuinely new (Edge Function backend) — slice 8 touched the *frontend* TGA callers (`ClientIntegrationsTab.tsx`'s adapters), never this function itself. |
| 3 | `src/pages/superadmin/AcademyAddCoursePage.tsx` | 2,389 | Already characterized — Phase 4 slice 5, **paused** (4 seams landed, remaining handlers deliberately deferred). |
| 4 | `src/pages/AuditTemplateBuilder.tsx` | 2,319 | Already characterized — Phase 4 slice 7, **paused** (1 seam landed). |
| 5 | `src/pages/ManageDocuments.tsx` | 2,051 | Already characterized — an earlier Phase 4 slice (documents/generation, slice #1 per this program's history). |
| 6 | `src/components/client/ClientTimeTab.tsx` | 2,040 | **Genuinely new** — client time-tracking/package-hours UI. Not touched by any slice. |
| 7 | `supabase/functions/ask-viv-assistant/index.ts` | 2,003 | Genuinely new (Edge Function backend) — slice 8 touched the *frontend* Ask Viv chat hook, never this function. |
| 8 | `src/pages/TasksManagement.tsx` | 1,820 | **Genuinely new** — staff task management. Not touched by any slice. |
| 9 | `src/components/client/ClientStructuredNotesTab.tsx` | 1,806 | **Genuinely new** — client notes (also where slice 8's ClickUp-AI-note adapter is called from, but the tab itself wasn't characterized). |
| 10 | `src/components/client/ClientIntegrationsTab.tsx` | 1,781 | Just closed — Phase 4 slice 8. Direct-call surface is now clean; remaining size is UI/state, not extraction candidates. |
| 11 | `src/components/client/TenantUsersTab.tsx` | 1,654 | **Genuinely new for Phase 4**, but already has its own characterization doc from an earlier client-identity/invitations investigation this program — see `client-identity-invitations-characterization.md`. Cross-reference, don't re-characterize from scratch. |
| 12 | `supabase/functions/compliance-assistant/index.ts` | 1,611 | Genuinely new (Edge Function backend) — AI compliance assistant, not part of any Phase 4 slice. |
| 13 | `src/components/eos/LiveMeetingView.tsx` | 1,566 | Already characterized — Phase 4 slice 6, **exhausted** (3 seams landed). |
| 14 | `src/pages/ManageTenants.tsx` | 1,493 | **Genuinely new** — tenant lifecycle/management, explicitly named in the plan's own routing crosswalk as touching tenant identity. |
| 15 | `src/components/ask-viv/AskVivPanel.tsx` | 1,490 | **Genuinely new** — the Ask Viv chat UI panel itself (distinct from the `useAskVivAssistantChat.ts` hook slice 8 already extracted from). |

**9 of 15 are genuinely new candidates**, never touched by Phase 4 slices
1-8: `AdminStageDetail.tsx`, `tga-sync/index.ts`, `ClientTimeTab.tsx`,
`ask-viv-assistant/index.ts`, `TasksManagement.tsx`,
`ClientStructuredNotesTab.tsx`, `compliance-assistant/index.ts`,
`ManageTenants.tsx`, `AskVivPanel.tsx`. `TenantUsersTab.tsx` is new to
*this* program but already has a prior characterization doc to build from
rather than start over.

## Approximate direct-Supabase-call surface on the new frontend candidates

Single-line grep counts only (`supabase\.(from|rpc)` / `functions\.invoke`)
— given this session's own repeated lesson that this pattern misses
wrapped method chains, treat these as **directional, not authoritative**;
whichever candidate is actually picked up for extraction needs the same
AST-based check slice 8 ended up requiring, not this number alone.

| File | Approx. direct calls |
|---|---:|
| `AdminStageDetail.tsx` | ~6 |
| `ClientTimeTab.tsx` | ~9 |
| `TasksManagement.tsx` | ~16 |
| `ClientStructuredNotesTab.tsx` | ~5 |
| `TenantUsersTab.tsx` | ~8 |
| `ManageTenants.tsx` | ~8 |
| `AskVivPanel.tsx` | ~5 |

## What this half does not cover

- RBAC v6 / Tenant Operating Model / Client Health Activity Analytics
  ownership — whether any of the 9 genuinely-new candidates touch tenant
  identity, authorization, messaging, or health-analytics contracts that
  should route through one of those initiatives' own discovery scope
  instead of (or before) a Codebase Optimization extraction. That is
  Codex's half of this same exit re-audit, per the joint split agreed on
  the coordination board.
- Any decision on whether to open a slice 9+ for any of these candidates —
  that's the joint reconciliation step after both halves land, and
  ultimately Carl's call on whether/how Phase 4 continues versus moving to
  Phase 5.
- The Edge Function backends (`tga-sync`, `ask-viv-assistant`,
  `compliance-assistant`) were sized here but not characterized in any
  depth — Phase 4's P6 slices have so far only ever targeted frontend
  hotspots; whether backend Edge Functions of this size belong in the same
  program or a separate one is an open question for the joint
  reconciliation, not decided here.
