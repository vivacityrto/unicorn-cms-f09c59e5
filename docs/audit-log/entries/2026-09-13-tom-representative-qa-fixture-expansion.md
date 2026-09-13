# 2026-09-13 — TOM representative QA query-family fixture expansion

> **Tag:** `audit-2026-09-13-tom-representative-qa-fixture-expansion`
> **Owner:** Codex
> **Target:** `unicorn-qa` (`qfpxvumcrnzrjyvqkicq`)
> **Boundary:** QA-only synthetic data and read-only browser characterization

## Trigger and authorization

This entry records the execution authorized after the representative
query-family fixture contract was approved. The purpose was to make the
remaining TOM P0.2/P0.3 query families observable in the allowlisted QA
project and run the existing protected, read-only characterization workflow.

No production, schema, RLS, grant, Realtime publication, Edge Function, cron,
export, outbound integration, or credential change was authorized or made.
The project-scoped QA connector was used for the fixture transaction and
verification; no production write was issued.

## Preflight and data change

Before the write, all seven target families were empty in QA. A single
transaction added only synthetic, deterministic rows:

| Family | Rows | Isolation marker |
| --- | ---: | --- |
| `tenant_addresses` | 3 | `notes = TOM_P0_20260913_QUERY_FIXTURE` |
| `tenant_relationships` | 1 | `notes = TOM_P0_20260913_QUERY_FIXTURE` |
| `tenant_csc_assignments` | 2 | captured generated ids `1`, `2` |
| `connected_tenants` | 2 | captured fixed run-scoped UUIDs |
| `conversation_participants` | 3 | captured existing QA conversation ids plus synthetic persona ids |
| `ask_viv_conversations` | 1 | captured fixed run-scoped UUID |
| `ask_viv_turns` | 2 | captured fixed run-scoped UUIDs |

The rows use only the existing synthetic QA tenants/personas and existing QA
conversation parents. No production identifiers or customer data were copied.
The first browser run exposed that the two synthetic turns used
`mode = 'compliance'`, while the current history hook reads `mode =
'assistant'`. Those two fixed QA rows were corrected to `assistant` before the
second run; no application code or production data was changed.

## Verification

- The corrected QA fixture query returned exactly `3/1/2/2/3/1/2` rows in
  the family order above after the correction.
- Protected workflow run
  [`34757389988`](https://github.com/vivacityrto/unicorn-cms-f09c59e5/actions/runs/34757389988)
  completed successfully with `84 passed, 48 skipped`; it observed the
  relationship, CSC-assignment, connected-tenant, participant, and other
  existing staff read paths.
- Corrected protected workflow run
  [`34757778368`](https://github.com/vivacityrto/unicorn-cms-f09c59e5/actions/runs/34757778368)
  completed successfully with `84 passed, 48 skipped`. Its waterfall included
  successful reads of `tenant_relationships`, `tenant_csc_assignments`,
  `connected_tenants`, `conversation_participants`, and `ask_viv_turns` with
  no request failures. The `tenant_addresses` family was not reached by the
  current browser spec, and `ask_viv_conversations` was not separately
  requested by the observed route; neither is claimed as browser-characterized.
- Production aggregate counts were re-read and unchanged from the preflight:
  `tenants 416`, `tenant_addresses 722`, `tenant_relationships 2`,
  `tenant_csc_assignments 149`, `connected_tenants 109`,
  `conversation_participants 2216`, `ask_viv_conversations 77`, and
  `ask_viv_turns 294`.

## Cleanup and remaining gates

Cleanup was intentionally not run because this is the persistent synthetic QA
evidence fixture, not an ephemeral browser-state run. If retirement is later
approved, cleanup must use the captured primary keys and the marker above in
dependency order, then re-query every affected relation; it must not delete
the persistent QA E2E personas, shared lookup rows, or unrelated QA data.

The evidence does not establish export/download behavior, Realtime delivery,
enabled Ask Viv generation, address UI behavior, full production-scale
cardinality, numeric performance thresholds, or owner approval. Those remain
separate TOM/RBAC/Client Health gates.
