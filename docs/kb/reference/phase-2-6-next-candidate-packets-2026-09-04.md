# Phase 2.6 next-candidate preparation packets

Preparation-only follow-up to the task-dialog packet. No runtime or database
changes are included.

## Candidate 2 — title extraction pair

`extract-note-title` and `extract-suggest-title` are approximately 135 LOC
each with a roughly 12-line behavioral difference. Proposed boundary: one
private shared title-extraction service, while retaining both public Edge
Function names, request/response contracts, authentication, CORS behavior,
rate handling, and provider-failure semantics. Required before coding: source
diff, deployed-caller inventory, auth/CORS/rate/error parity tests, and a
negative test proving caller-controlled URLs or provider payloads cannot widen
the contract.

## Candidate 3 — stage quality evaluator

`useStageQualityCheck.tsx` is approximately 745 LOC with two near-duplicated
evaluation pipelines. Proposed boundary: a pure evaluator over a typed data
snapshot, leaving hook orchestration, Supabase reads, tenant binding, and UI
state outside it. Required before coding: fixtures for both pipelines,
score-by-score parity assertions, missing-data/unknown semantics, and a direct
comparison against the current live query shapes. No RLS, RPC, or schema change
belongs in this refactor.

## Candidate 4 — seat-card presentation core

`SeatCard` and `DraggableSeatCard` share presentation but differ in drag,
mutation, health, and permission behavior. Proposed boundary: display-only
primitive plus explicit adapters. This is lowest priority and should not begin
until the interactive contexts have independent browser coverage and the
shared primitive has no authority or mutation responsibilities.

## Common gate

These packets remain queued behind Claude's Phase 2.5 exit checkpoint and the
task-dialog cohort. Each implementation gets a fresh worktree, focused parity
fixtures, the full verification contract, authenticated Playwright coverage,
one PR, post-merge documentation, and exact worktree cleanup. Any discovery
that changes RBAC, tenant scope, schema, RLS, RPC, trigger, grant, or Edge
contracts becomes a separately scoped RBAC/tenant vertical slice.
