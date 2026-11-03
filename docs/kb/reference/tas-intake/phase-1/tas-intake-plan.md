# TAS intake and consultant builder — delivery workstream plan

> **Parent plan:** none — a time-boxed delivery workstream, not a fifth program initiative (see [program index](../../program-index.md))
> **Program index:** [program-index.md](../../program-index.md)
> **Status:** planning — direction approved 2026-11-03; no implementation started
> **Owner:** Carl (technical lead); Angela (product and content owner, to be confirmed as decision D1)
> **Scope:** a consultant-led intake for a Training and Assessment Strategy (TAS), then a consultant workspace, for Unicorn clients without ComplyHub
> **Dependencies:** existing tenant, stage-task, evidence-request and research primitives; separate production-hardening work that gates the evidence and research phases (recorded once it has landed)
> **Exit criteria:** a consultant runs a synthetic intake to a submitted, versioned brief on Demo RTO; a client confirm-only pilot has baseline measures; later phases are gated on those measures, not on dates
> **Evidence:** none yet
> **Audit entry:** none needed — documentation only; every migration PR in this workstream carries its own

## Purpose

Unicorn's team currently collects TAS inputs from a long historical survey
export. The proposal is a short adaptive intake that a consultant starts from a
client's existing stage task, a one-page consultant brief with provenance, and,
later, a consultant workspace for research, drafting, review and export.
Clients contribute industry and operational expertise; Vivacity contributes
compliance judgement. Nothing here approves a TAS automatically, contacts a
client automatically, or moves data between products.

This document records the agreed shape and order of work. It deliberately does
not restate field-level wording, vendor terms or internal decision detail;
those live in private working notes until each decision lands.

## Agreed shape

- **Two layers.** A guided intake (buttons and text first; voice only after its
  own approval), then a consultant TAS workspace.
- **Human decisions only.** Received, reviewed and approved-for-drafting are
  separate states; submission freezes a version; AI never invents facts or
  approves anything.
- **No ComplyHub subscription required.** Reuse of any ComplyHub engine is a
  separate written decision by both entities' governing persons. Nothing
  owned by ComplyHub is copied into this repository.
- **Question content is data, not code.** The catalogue is keyed and versioned.
  Real question wording is seeded privately after the content owner approves
  it; this repository holds structure and placeholder wording only.

## Sequence

| Phase | Purpose | Gate to start |
|---|---|---|
| Hardening track (parallel) | Production-hardening changes to the primitives TAS reuses | none; hard-gates the evidence and research phases |
| 0b | Privacy impact assessment, sub-processor register, client-type gate (RTO, CRICOS, GTO) | none; gates anything a client touches |
| 1 | Throwaway staff-only vertical spike on the QA project, never merged | provisional decisions recorded |
| 2 | Catalogue, tables, access rules and save/submit RPCs | named decisions closed; spike report accepted |
| 3 | Staff-run MVP: interview renderer, consultant brief, per-answer review | Phase 2 live |
| 4 | Client confirm-only view for an existing portal user | privacy gate and collection notice |
| 5 | Question-linked evidence | hardening track live |
| 6 | Research adapter on the existing research function | hardening track live |
| 7 | Controlled current-client release with invitations | Phases 4 and 5 |
| 8 | Voice pilot | voice provider, consent and retention approved |
| 9 | Builder, approval and Word export | reuse decision and pilot measures |
| 10 | Onboarding reuse | stable interview |

Sizes and dates are deliberately not committed. The binding constraints are
decision turnaround and review capacity, not code volume.

## Boundaries

- **Client types.** RTO and CRICOS clients are in scope. A client delivering
  under the National Standards for GTOs 2017 is not an RTO Standards client, so
  GTO intake is refused at creation rather than silently handled.
- **No voice and no AI model in the MVP.** "Adaptive" means deterministic branch
  rules over the versioned catalogue. Existing browser dictation is not mounted
  on TAS screens until the voice decision is made.
- **Access.** Tables are written only through server-side functions; client
  access is checked against the portal membership table, excludes disabled and
  archived users and staff callers, and is proven by a persona test matrix on
  the QA project before any production apply.
- **Public repository.** Planning material that names unresolved
  weaknesses stays out of this repository until those are fixed.
- **Regulatory framing.** The 2025 Outcome Standards do not define a TAS or
  prescribe its sections; the section list is Vivacity house method and is
  labelled as such. Regulatory interpretation in planning notes is draft only;
  the approved policy suite and consultant advice are authoritative.

## Decisions outstanding (owners)

Product owner and content approver; roles for inviting, submitting, reviewing
and approving; minimum data to start review; intake granularity (per
qualification, per cohort); client-type gate; question-catalogue publication;
answer-state model; erasure versus immutable versions; voice provider and
retention; engine reuse; research sources; export format; pilot cohort and
measures; maintenance owner. The first five of these are closed before any
production table exists, because they cannot be changed afterwards without a
data migration.

## Verification approach

Each phase names its oracle before it starts: reconciliation of every legacy
field to one disposition, pure branch-engine fixtures, a persona matrix on the
QA project, concurrency and idempotency tests, hook and component tests, and an
authenticated Playwright pass on Demo RTO with seeded data cleaned up. Every
hosted migration goes to the QA project first, then to production only on
explicit approval, and each carries an audit entry per
[`docs/audit-log/README.md`](../../../../audit-log/README.md).

## Status log

- 2026-11-03 — direction approved; this workstream registered. First work:
  the hardening track, the privacy gate, and the throwaway spike.
