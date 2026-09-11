# RBAC v6 — Packet P1-a: review worksheet export (mechanical slice of P1)

> **Parent plan:** [RBAC v6 Authorization Implementation and Gate-Streamlining Plan](../../rbac-v6-authorization-implementation-plan-2026-09-01.md) — §7 P1
> **Program index:** [Program Index](../../program-index.md)
> **Status:** P1-a (mechanical export) delivered 2026-09-11. The rest of P1 (ADR, classification, job-role defaults, golden matrix, operational workflow matrix, communications capability family) is **not started** and is explicitly blocked on Carl/Vivacity product and security input, not on any remaining engineering work.
> **Owner:** Claude Code (P1-a only)
> **Evidence:** generated 2026-09-11 via Supabase MCP against the production project, at `origin/main@8de69bf00`
> **Audit entry:** none — read-only export, no schema/RLS/grant/data change

## Why this is split off

Plan §7 P1's work list is large and most of it requires judgment calls only
Carl/Vivacity's product and security stakeholders can make: an ADR for the
five-concept model, classifying all 523 role rows into atomic actions and
scopes, defining job-role defaults "with the product owner and a
representative of each operating seat," and a golden access matrix that must
be "separately reviewed, versioned... owned by product/security." None of
that is something to push through unilaterally.

One line of P1's work list, though, is purely mechanical and needed by
everything else in P1: *"Export all 85 current features and 523 role rows
into a review worksheet or generated Markdown table."* That's P1-a — done
here, nothing else.

## What was delivered

[`data/p1-a-worksheet.json`](data/p1-a-worksheet.json) — all 85
`permission_features` rows (`feature_key`, `label`, `module`, `category`,
`is_active`, `sort_order`), each with its full `role → level` map from
`role_permissions`. Generated via one server-side SQL pivot
(`jsonb_object_agg`) against production, not hand-transcribed — avoids the
transcription-error risk of manually joining 523 rows across two tables.

Total: 85 features, 523 role rows, matching P0.1-b's counts exactly (no
drift between the two packets' independent queries).

## One matrix-gap finding, already anticipated by the plan

Every feature has 6-7 role rows (the 6 standing internal roles, plus
`Bulk Generate Automation` for the one feature that needs it) **except
`admin.documents.bulk_generate`, which has exactly 1** (only
`Bulk Generate Automation: full` — no row at all for `BGT`, `CET`, `CSC`,
`Integrator`, `Super Admin`, or `Team Leader`). This is the exact same gap
plan §7 P0.5 already names ("explicitly seed the six
`admin.documents.bulk_generate` gaps as `none`/inactive until separately
approved") — confirmed here with a live query rather than assumed. It's a
missing-row gap, not an explicit `none` grant: the six standard roles simply
have no `role_permissions` row for this feature at all. **Not fixed here**
— P0.5's own explicit-approval requirement applies; this packet only
confirms the gap exists and matches what the plan already flagged.

## What is explicitly NOT done in this packet (and why)

Per the plan's exit gate, P1 is only complete when:

- every feature has an approved atomic-action/scope classification (not
  guessed — the plan says "mark unknown cases; do not guess");
- the Stage capability candidates (`stages.view/create/edit/publish/archive/
  analytics.view/assignment.manage`) are added and classified;
- job-role defaults are defined with the product owner and a seat
  representative;
- a separately owned, versioned golden access matrix exists as the test
  oracle;
- an operational workflow matrix and a communications capability family are
  defined;
- an ADR records the five-concept model and hard-SA/break-glass policy.

None of that is attempted here. This worksheet is the *input* to that work,
not a substitute for it — a generated catalogue "proves completeness but
does not define... expected authorization" (plan's own words, §7 P1 exit
gate).

## Recommended next step (needs Carl's direction, not a default I should assume)

Two reasonable ways to move P1 forward from here, genuinely different in who
does what:

1. **Carl/product first-passes the classification** using the worksheet as
   input, with me or Codex available to answer "what does this feature
   actually gate today" questions from source as they come up.
2. **I draft a first-pass proposed classification** (atomic action + scope
   per feature, `unknown` marked explicitly wherever the current behavior is
   ambiguous from source alone) as a **discussion draft** for Carl/product to
   review and correct — not a decision, the same way the TOM/RBAC capability
   cross-check table was done jointly earlier in this program. This is
   faster to start but only useful if Carl actually wants a straw-man to
   react to rather than a blank worksheet.

Not proceeding with either without direction — flagging this as the actual
open question P1 is blocked on.

## Verification

Docs-only change (`docs/**` only, plus a generated JSON data file) — no
`src/`, `supabase/`, dependency, or workflow file touched.
`node scripts/check-kb-links.mjs` and `node scripts/check-kb-doc-size.mjs`
are the relevant checks; no lint/typecheck/test suite applies since no code
changed.
