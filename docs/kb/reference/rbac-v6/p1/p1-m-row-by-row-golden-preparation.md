# RBAC v6 — Packet P1-m: row-by-row golden-matrix preparation

> **Parent plan:** [RBAC v6 Authorization and Gate-Streamlining Plan](../../rbac-v6-authorization-implementation-plan-2026-09-01.md) — §7 P1
> **Inputs:** [P1-d static enforcement ledger](p1-d-static-enforcement-ledger.md), [P1-e verb decomposition](p1-e-bundled-verb-decomposition.md), [P1-l golden-matrix review draft](p1-l-aj-csc-golden-matrix-review-draft.md), [TOM P0.1 source inventory](../../../codebase-state/tenant-p0-source-inventory.md)
> **Machine-readable ledger:** [P1-m normalized row ledger](data/p1-m-row-by-row-golden-preparation.json)
> **TOM intersection:** [P1.1 contact-promotion row reconciliation](p1-1-tom-contact-promotion-row-reconciliation.md)
> **Program index:** [Program Index](../../program-index.md)
> **Status:** preparation ledger delivered 2026-09-14; all 85 feature rows carry the required review fields; unresolved actor/target/boundary values remain explicit and no row is an approved policy or implementation grant
> **Owner:** RBAC v6 with product/security approval; TOM owns tenant/resource relationship semantics
> **Source:** `normalized from P1-d at 49fa5e71c401e046c82071a7ba3b05e6d78c373f`
> **Audit entry:** none needed — documentation/data preparation only; no authorization, schema, credential, hosted QA, or production action

## Purpose and boundary

P1-d established the 85-row static enforcement ledger. This packet makes the
golden-matrix preparation schema explicit and reviewable by carrying every row
forward with the same source evidence plus separate `action`, `target`,
`actor`, `scope`, `relationship_proof`, `first_enforcement_boundary`,
`denial_case`, `owner`, `readiness`, and `policy_state` fields.

This is a preparation artifact, not a policy decision. In particular, the
normalized `target` and `actor` values are intentionally explicit
`unresolved` placeholders where the current static evidence does not prove a
trusted resource target or authenticated principal/seat. A feature label,
route role, or frontend visibility is never silently promoted into either
field.

## Row coverage and readiness

The machine ledger contains all **85** active feature rows from P1-d. Its
current readiness distribution is:

| Readiness | Rows | Meaning |
| --- | ---: | --- |
| `needs_enforcement_inventory` | 58 | Trace route/API/RPC/Edge/RLS and trusted target/actor evidence |
| `needs_product_input` | 16 | Resolve bundled or semantically ambiguous actions with product |
| `needs_security_review` | 11 | Resolve high-risk control, approval, expiry/revocation, and denial evidence |

All rows have `policy_state: candidate_not_approved`. No row is
`implementation_ready`.

## Required fields

| Field | Preparation rule |
| --- | --- |
| `feature_key` | Stable catalogue key carried from P1-d |
| `action` | Current proposed verb only; bundled verbs remain candidates for decomposition |
| `target` | Trusted resource/record target; unresolved until the first server boundary proves it |
| `actor` | Authenticated principal/seat or machine identity at the first trusted boundary; unresolved until proved |
| `scope` | Current proposed scope (`all_tenants`, `global`, `own_resource`, or explicit unresolved value); not a grant |
| `relationship_proof` | TOM-owned tenant/package/stage/membership/ownership evidence required at the boundary |
| `first_enforcement_boundary` | First server-side RLS/RPC/Edge/API boundary to characterize; static caller evidence is not proof |
| `denial_case` | Named negative persona, target, replay, stale-context, or cross-tenant case still required |
| `owner` | Product/security/RBAC/TOM/Client Health owner for the next review |
| `readiness` | Evidence state from P1-d, never an approval state |
| `policy_state` | Explicitly `candidate_not_approved` until product/security signs the row |

## Golden-matrix review sequence

1. Product/security reviews the action and decomposition, especially the 18
   bundled `manage`/`use` rows and the two special rows.
2. TOM replaces unresolved target/scope/relationship fields with the
   versioned tenant, membership, package, stage, and ownership contract.
3. RBAC traces the first trusted boundary and records the effective RLS/RPC/
   Edge enforcement plus a direct denial case.
4. Security reviews high-risk rows for non-delegability, target resolution,
   approval, expiry/revocation, audit, and replay controls.
5. Only approved rows with direct positive/negative evidence may be copied
   into a separately versioned golden access matrix. Role defaults, grants,
   route changes, RLS changes, Edge changes, telemetry, pilot enrollment, and
   cutover remain separate implementation gates.

## Current cross-initiative boundary

TOM owns tenant identity, membership/contact semantics, package/stage
relationships, CSC ownership, and tenant/resource target resolution. RBAC owns
action vocabulary, scope, relationship requirements, delegability, and
authorization evidence. Client Health joins only where a real health/activity/
Ask Viv consumer is affected; it does not supply authorization by inference.
ADR-030's broad internal-staff read policy does not authorize sensitive writes,
exports, lifecycle actions, assignments, or external effects.

## Exit and stop boundary

This preparation packet is complete when the 85 rows are mechanically present
with the required fields and explicit readiness/policy states, which this
ledger provides. The next review must resolve the named unknowns row by row;
silence, a general approval, a route role, or a feature label does not fill
unresolved actor, target, relationship, boundary, or denial fields.

No capability/role grant, default activation, pilot enrollment, telemetry
sink, hosted QA, route cutover, RLS/RPC/Edge change, migration, production
observation, credential action, or live-data action is authorized.

## Verification

Validate the JSON shape and counts, then run
`node scripts/check-kb-links.mjs`, `node scripts/check-kb-doc-size.mjs`,
and `git diff --check`. Runtime suites and live verification are not
applicable because this packet changes documentation and preparation data only.
