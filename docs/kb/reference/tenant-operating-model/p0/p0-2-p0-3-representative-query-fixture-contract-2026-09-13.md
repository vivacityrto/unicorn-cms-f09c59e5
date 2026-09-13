# TOM P0.2/P0.3 — representative query-family fixture contract

> **Last updated:** 2026-09-13
> **Status:** approval-ready planning artifact; no hosted fixture write or browser run authorized by this document
> **Owner:** Tenant Operating Model, with RBAC v6 and Client Health Activity Analytics review
> **Parent packet:** [P0.2/P0.3 disposable baseline characterization](p0-2-p0-3-disposable-baseline-characterization.md)
> **Evidence follow-up:** [cardinality and query-family follow-up](p0-2-p0-3-cardinality-query-family-follow-up-2026-09-13.md)
> **Cross-initiative review:** [owner-review matrix](p0-2-p0-3-cross-initiative-review-2026-09-13.md)
> **Repository context:** `origin/main@0fb9c697d883e06a8ac6e08e9d1fbdbc2bb62c9d`
> **Audit entry:** none needed — this is preparation only and makes no hosted or production change

## Purpose and boundary

The existing QA fixture proves protected navigation and bounded populated/empty
behavior, but it cannot exercise several query families because QA currently
has zero rows in `tenant_addresses`, `tenant_relationships`,
`tenant_csc_assignments`, `connected_tenants`, `conversation_participants`,
`ask_viv_conversations`, and `ask_viv_turns`. Production aggregate counts and
the cross-initiative review are recorded in the linked follow-up documents.

This contract defines the smallest synthetic expansion that would make those
families observable in a separately authorized QA-only run. It does not grant
access, define a new capability, repair Realtime publication, enable Ask Viv,
invoke an export, or authorize any write. No production identifier, row, name,
email, credential, or payload may be copied into QA.

The proposed target remains the allowlisted `unicorn-qa` project
(`qfpxvumcrnzrjyvqkicq`). The fixture is disposable by data scope: every row
created by a future run must carry a generated `run_id` in the run manifest,
and cleanup must use the captured primary keys, not a broad status or tenant
predicate.

## Synthetic strata and minimum row contract

The existing QA tenants/personas remain the base fixture. Add only the rows
needed for the following strata; exact UUIDs, tenant names, emails, and dates
are generated at run time and retained only in the private run bundle.

| Family | Minimum synthetic shape | Read characterization it enables | Required isolation/negative case |
| --- | --- | --- | --- |
| `tenant_addresses` | Two addresses for a representative tenant with distinct `address_type` values, one inactive address, and one address for the A/B comparison tenant | Tenant-detail address list, type/inactive filtering, empty-versus-populated behavior, and row cardinality | Client User A cannot read the other tenant's address rows; same-named address content remains tenant-scoped |
| `tenant_relationships` | One approved synthetic parent/child pair plus a second tenant with no relationship; preserve `bills_to_parent` as a fixture value, not a new policy statement | Relationship lookup, absent relationship handling, and parent/child display paths | Relationship visibility does not become authorization; a user from the unrelated tenant cannot retrieve the pair |
| `tenant_csc_assignments` | One active primary assignment for the representative tenant, one ended/superseded historical assignment, and no assignment for the empty tenant | Current-versus-history rendering, primary selection, and empty state | Assignment evidence does not grant a capability; action and target checks remain separately asserted |
| `connected_tenants` | One synthetic connection for the representative tenant and one unrelated-tenant connection with distinct generated user identity | Connected-tenant list/detail and tenant identity resolution | Cross-tenant connection lookup is denied or absent according to the current contract; do not infer sharing from a matching display name |
| `conversation_participants` | At least two participants on a representative conversation and a second conversation with a different tenant's participant; use the existing tenant conversation rows | Participant list, same-tenant conversation access, and participant-dependent query shape | Client User A is denied cross-tenant conversation/participant retrieval; staff broad reads remain distinct from sensitive actions |
| `ask_viv_conversations` / `ask_viv_turns` | One synthetic history conversation tied to a representative tenant and user, with one user turn and one assistant turn; no generation request | History list, turn ordering, tenant scoping, and unavailable/empty behavior | No source facts, consultant data, secrets, or real prompts; disabled rollout remains unavailable and does not imply generated output |

The fixture may reuse already-seeded tenant/user/persona rows only after the
run manifest records their synthetic ownership and confirms they are not
production-derived. If a required foreign key cannot be satisfied without
copying production identity or changing schema/RLS, stop and return
`Inconclusive`; do not weaken the fixture or bypass the constraint.

## Query-family and outcome matrix

The future read-only run should visit only the current source paths that are
covered by this matrix. It should capture visible state, request method/status,
redacted payload size, timing, and the run/fixture hash. It must not call a
writer merely to create evidence.

| Query family | Positive observation | Negative/unknown observation | Owner interpretation |
| --- | --- | --- | --- |
| Detail child relations | Representative tenant shows the synthetic rows and stable empty/disabled states | Unrelated tenant does not expose the rows; missing relation remains empty, not “normal” by inference | TOM owns current data-path description; RBAC owns action/scope interpretation |
| Assignment and relationship context | Current and historical rows are distinguishable without rewriting legacy fields | Relationship/assignment absence does not grant or revoke a capability by itself | TOM/RBAC must keep relationship facts separate from authorization |
| Conversation participants | Same-tenant participants are visible where the current UI contract permits | Cross-tenant participant/conversation retrieval is denied or absent and logged as the expected outcome | RBAC/security confirms the negative oracle; Client Health receives no unscoped fact |
| Ask Viv history | Existing synthetic history renders only when the approved rollout/read contract permits it | Disabled rollout, missing history, or failed source remains `unavailable`/empty; no generation is attempted | Client Health owns provenance/freshness semantics; RBAC owns retrieval scope |
| Realtime refresh | No delivery claim is made in this fixture run | Publication/listener mismatch remains an observed gap | Realtime publication changes require a separate authorized packet |
| Export/download and SharePoint | Not exercised by this contract | No export is inferred from a successful read | Requires a separate safe fixture, owner, and security oracle |

The protected staff baseline continues to reflect ADR-030's broad internal
read decision. The run must not convert that read observation into broad write,
export, destructive, cross-tenant retrieval, or external-side-effect authority.
For each negative case, record whether the current result is `denied`,
`empty`, or `unavailable`; do not collapse those states into a generic pass.

## Run, cleanup, and evidence gates

Before any hosted fixture write or browser run, the operator must have all of
the following in the run record:

1. explicit approval of the synthetic strata and query-family matrix by TOM,
   RBAC/security, and Client Health owners;
2. confirmation that `unicorn-qa` is the target and production is hard-blocked;
3. a short-lived QA-only credential or an explicitly bounded QA service-role
   read/write identity, with its storage and expiry owner recorded;
4. generated run ID, fixture hash, exact inserted primary keys, foreign-key
   map, and a pre-run aggregate snapshot;
5. a named operator, observation window, private artifact location, and
   retention period; and
6. a cleanup proof that deletes only the run's captured rows in dependency
   order, re-queries each affected relation, and records zero residual rows.

The actual fixture write is a separate operation and must be approved before
execution. A failed preflight, missing storage state, unexpected foreign key,
non-QA project, or ambiguous authorization result is `Inconclusive` and stops
the run. No retry may broaden identity, scope, or data selection.

## Explicitly out of scope

- production data reads beyond the already-recorded aggregate evidence;
- production or QA schema, RLS, grant, Realtime publication, Edge Function,
  cron, or credential changes;
- Ask Viv generation, source ingestion, consultant-data import, or forecast
  repair;
- export/download or SharePoint side effects;
- changing Parent/Child, CSC assignment, relationship, capability, or tenant
  visibility semantics; and
- performance budgets or “healthy” conclusions before representative strata
  and owner-approved numeric thresholds exist.

## Approval decision requested

The next owner decision is narrow: approve or reject this QA-only fixture
shape and its negative-case matrix. Approval would authorize preparation of a
separate execution packet, not the hosted write itself. Until that decision is
recorded, TOM P0.2/P0.3 remains expanded bounded evidence with representative
query-family coverage open.
