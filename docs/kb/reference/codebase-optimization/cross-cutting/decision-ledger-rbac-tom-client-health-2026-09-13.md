# Cross-initiative decision ledger — RBAC, TOM, and Client Health

> **Last updated:** 2026-09-13 · **Status:** active decision register; A1–A7 settled/prepared, A8 external-data gated, A9 legacy client-role retirement planning approved
> **Purpose:** one canonical ledger for the remaining decisions Carl must approve, review, or analyze before continuous implementation
> **Inputs:** [RBAC P1-s resource dispositions](../../rbac-v6/p1/p1-s-aj-csc-resource-disposition-recommendation.md), [RBAC P1-r read-resource QA gate](../../rbac-v6/p1/p1-r-aj-csc-read-resource-decomposition-and-qa-gate.md), [RBAC P1-q live read-boundary reconciliation](../../rbac-v6/p1/p1-q-aj-csc-live-read-boundary-reconciliation.md), [approval-unblock matrix](approval-unblock-matrix-2026-09-12.md), [unattended-preparation authorization matrix](unattended-preparation-authorization-matrix-2026-09-13.md), [Program Index](../../program-index.md)
> **Owners:** Carl for product/policy approvals; RBAC for capability and server-boundary design; TOM for relationship semantics; Client Health for metric/data semantics; security for privileged-boundary review
> **Evidence baseline:** `origin/main` at the time of this packet; live read-only Supabase metadata reconciled 2026-09-13
> **Audit entry:** none needed — synthetic non-production QA fixture/persona provisioning only; no production, schema, authorization, or production credential state changed

## How to use this ledger

We will discuss one decision ID at a time, in order. A decision is not
considered complete from a chat acknowledgement alone: after Carl decides, the
ledger will be updated in a dedicated documentation PR with the decision,
evidence relied on, owner, and next action. No implementation starts merely
because a row is marked discussed.

Status meanings:

- `current discussion` — the only item being discussed now;
- `awaiting Carl` — a clear approval or product choice is required;
- `awaiting TOM` — relationship or operating-model semantics are required;
- `awaiting security` — a security owner must assess a privileged or
  potentially fail-open boundary;
- `awaiting external data` — evidence is outside the repository and must be
  supplied by consultants or operations;
- `prep only` — safe documentation/static analysis may continue, but no
  runtime or hosted action is authorized; and
- `settled` — do not reopen unless new evidence contradicts the recorded
  decision.

## Current discussion order

| ID | Decision | Current status | Recommended disposition | What unlocks next |
| --- | --- | --- | --- | --- |
| **A1** | Accept the seven-resource RBAC read split | **settled — approved by Carl 2026-09-13** | Keep catalogue, mapping, package-instance, client-stage, enrolment/progress, analytics, and stage-version resources distinct; do not revive broad `packages.view`/`stages.view` rows | A2 bounded QA authorization |
| **A2** | Authorize bounded read-only QA | **settled — approved by Carl 2026-09-13** | Characterization only for package instances and client stages; no grants, routes, RLS/RPC changes, or implementation | A3 fixture/persona/owner definition |
| **A3** | Select QA fixture/personas/owners | **settled — approved by Carl 2026-09-13** | Use isolated `unicorn-qa` data with the named persona and negative-case matrix; name operator, security reviewer, artifact owner, and rollback owner before execution | A4 internal-staff visibility decision |
| **A4** | Define internal-staff visibility for these resources | **settled — approved by Carl 2026-09-13** | Internal Vivacity CSCs have full portfolio-wide tenant-operational access, with actions recorded in timeline activity; platform security administration remains separate | A5 security-boundary investigation |
| **A5** | Authorize the security-boundary investigation | **settled — approved by Carl 2026-09-13** | Read-only investigation of stage privileged RPCs, disabled-principal behavior, anonymous ACL/policy mismatch, view transitivity, and inactive-membership enforcement; remediation remains separately gated | A6 client-stage state classification |
| **A6** | Classify client stage state | **settled — approved by Carl 2026-09-13** | TOM/domain owns the canonical lifecycle; Client Health may consume status/date/derived `node_state` as operational evidence; client workflows may display the approved subset | A7 TOM hosted-QA preflight |
| **A7** | Authorize TOM hosted-QA preflight | **initial run passed 2026-09-13: 7 passed, 1 intentional skip across four provisioned TOM personas** | Keep the current behavior evidence: client home/packages reads pass; `/client/users` redirects to `/client/home` for `relationship_role=user`; CSC `/manage-tenants` read/search passes. Remaining coverage, query-plan, baseline, and cross-initiative review gates stay open | Complete the broader packet or record explicit `Inconclusive` dispositions |
| **A8** | Resolve Client Health semantic gates | awaiting external data/Carl | Keep thresholds, cohorts, confidence semantics, and pilot acceptance gated on consultant operational input | H1 metric/corpus decisions and later implementation |
| **A9** | Retire legacy Client Parent/Child account labels | **planning direction approved by Carl 2026-09-13; ten sequencing/semantic decisions recorded; implementation separately gated** | Treat Parent/Child as compatibility projections only; migrate to explicit account class, RBAC capability/scope, tenant membership, relationship role, and access scope before any removal | [P1.3 retirement plan](../../tenant-operating-model/p1/p1-3-legacy-client-role-retirement-plan.md), focused parity evidence, holdout disposition, and separate migration approval |

The order is intentional: A1 fixes the target shape before A2–A4 can be
meaningful; A5 runs as an independent security track; A6 prevents Client
Health from inheriting an RBAC meaning for stage state; A7 controls hosted
execution; and A8 remains externally gated.

## A1 — resource split (settled)

### Proposed decision

Accept these seven resource classes as separate authorization design targets:

1. global catalogue metadata;
2. package/stage mapping;
3. tenant-owned package instances;
4. client stage instances;
5. Academy learner/enrolment and progress data, split by sensitivity/action;
6. Academy aggregate analytics; and
7. stage-version history and release artifacts.

### Why this is the efficient boundary

The live system has materially different boundaries: catalogue relations have
unconditional authenticated SELECT policies; package instances are tenant-
scoped under forced RLS; Academy enrolments are relationship-sensitive;
composite views are security-invoker; and stage release RPCs are privileged
functions. Existing page roles and historical capability names combine these
surfaces and therefore cannot safely be copied into one grant.

### Decision record

Carl approved A1 on 2026-09-13. Keep the classes separate unless a later review
proves that target, sensitivity, relationship, first server boundary, audit
behavior, and negative cases are identical. This approval would authorize
only the design target; it would not authorize any capability row, grant,
route, policy, RPC, Realtime, pilot, or production change.

### Evidence and stop condition

Evidence is recorded in RBAC P1-q, P1-r, and P1-s. Any later proposal to
merge or split a class must record why its server boundary and data sensitivity
are genuinely shared or materially different. A2 may now be discussed against
this stable seven-class target.

## A2–A8 decision briefs

### A2 — bounded read-only QA (settled)

Carl approved A2 on 2026-09-13: authorize only a characterization packet for `package.instances.view` and
`client.stages.view`. The current path remains authoritative. The packet may
read and assert allow/deny behavior, but may not add v6 grants, change RLS or
RPCs, publish Realtime tables, change routes, write fixtures, or mutate
production.

Required output: direct server assertions, trusted subject/target resolution,
negative cases, audit/error outcome, and an explicit list of inconclusive
cases. A3 must define the safe fixture and named owners before execution.

### A3 — QA fixture and ownership

### Decision record

Carl approved A3 on 2026-09-13. The fixture must be safe, isolated, resettable,
and privately reviewable. The
minimum matrix is active AJ/CSC, ordinary CSC, client, disabled/archived/
expired/revoked, wrong tenant, wrong package/instance, inactive membership,
anonymous, and Super Admin. The packet must name the operator, security
reviewer, private artifact owner/retention, and rollback owner.

No hosted execution should begin while any of those fields is missing.

### A4 — internal-staff visibility

### Decision record

Carl approved A4 on 2026-09-13: internal Vivacity CSCs have full
portfolio-wide tenant-operational access, not merely visibility into assigned
tenants. Their tenant-operational actions are recorded in timeline activity.
This includes the relevant operational reads, updates, assignments, and
workflow actions. Platform security administration, credentials,
role/capability management, and infrastructure controls remain separately
governed.

This decision applies to the tenant-operational scope; it does not silently
grant platform administration or infrastructure control.

TOM's settled relationship model remains the input: `tenant_members` is the
future membership/access authority; `tenant_csc_assignments` is current CSC
ownership; the legacy tenant column is history/compatibility; and
`package_instances`/`stage_instances` are authoritative service-assignment
relations.

### A5 — security-boundary investigation (settled)

Carl approved A5 on 2026-09-13: authorize a separate read-only security packet
covering:

- authenticated execution and caller checks for
  `publish_stage_version`, `get_stage_version_diff`,
  `apply_stage_version_to_package`, and `can_edit_certified_stage`;
- disabled/archived/expired/revoked principal behavior, including the
  `is_super_admin_safe` path;
- effective anonymous versus authenticated access where ACL and policy roles
  appear inconsistent;
- transitive access through `v_academy_course_progress` and
  `v_client_package_stages`; and
- whether client-stage membership checks require active membership status.

This packet must report findings only. Any policy, grant, RPC, Realtime, or
production remediation requires a new explicit authorization.

### A6 — client stage state ownership (settled)

### Decision record

Carl approved A6 on 2026-09-13. TOM/domain owns the canonical stage lifecycle
state. Client Health may consume stage status, dates, and derived `node_state`
as operational evidence, while client-facing workflows may display the
approved subset. RBAC controls access separately for staff, clients, and other
roles. `node_state` is a derived stepper signal (`complete`, `current`, or
`future`), not an independent authoritative lifecycle field.

The choices considered were:

- operational Client Health evidence;
- client-facing learning/workflow state; or
- both, with separate visibility and purpose limitations.

The classification must include freshness expectations because the inspected
tables are not present in Realtime publication metadata.

### A7 — TOM hosted-QA preflight

The preflight details now available from the checked-in [offline QA fixture
manifest](../../tenant-operating-model/p0/p0-2-p0-3-offline-qa-fixture-manifest.md)
are:

| Field | Populated value | State |
| --- | --- | --- |
| Target | Existing allowlisted `unicorn-qa`; `productionTarget: false` | ready |
| Fixture strata | `small-empty`, `representative`, `skewed`, `disabled`, and a two-tenant `cross-tenant-a-b` pair | ready |
| Fixture domains | Tenants, identities/membership, contacts, packages, stages, audit, conversations, and messages | ready |
| Run identity | Generated run ID `tom-p0-2-p0-3-${timestamp}-${randomSuffix}` plus run-scoped fixture tag | ready |
| Reset/safety | Run-scoped cleanup, reverse-order cleanup, no production identifiers, no committed credentials, no writes in the ghost classifier | ready for approval |
| Observation | One warm-up and three measured repetitions per persona/stratum; redacted timings, request metadata, waterfalls, query plans, and visible empty/error/denied states | ready |
| Personas | Client Admin A/B, Client User A, CSC, Super Admin, and non-browser service principal; missing storage state is `Inconclusive` | ready for approval |
| Short-lived identities/storage states | QA-only credentials and browser storage states for the approved personas | **complete for four TOM personas; generated ephemerally in run 34741345064** |
| Operator/window | Named operator and execution window | **complete — Codex automated run, 2026-09-13 05:51–05:53 UTC within the approved 60-minute window** |
| Private evidence | Private artifact location, owner, retention, and reviewer access | **complete — private GitHub Actions artifact, Carl/repository maintainers, 30 days** |

The run should use the existing manifest as its baseline but narrow the first
RBAC pass to representative and cross-tenant package/client-stage cases plus
disabled/inactive negative cases. This avoids paying for the full TOM query
family matrix before the specific A2 resources are characterized.

The synthetic fixture was seeded on 2026-09-13 in the allowlisted QA project;
the seed record documents its run tag, aggregate production-shape comparison,
counts, and read-only verification. The first bounded browser run completed in
GitHub Actions run [`34741345064`](https://github.com/vivacityrto/unicorn-cms-f09c59e5/actions/runs/34741345064)
with `7 passed, 1 skipped` across the four provisioned TOM personas. Client
home/package reads passed for Client Admin A, Client User A, and Client Admin
B. Their fixture rows use `relationship_role=user`, so `/client/users`
redirected to `/client/home`, preserving the current management gate despite
the legacy Admin/Client Parent labels. CSC reached `/manage-tenants` and
completed the safe search round-trip; the client-only test was intentionally
skipped for CSC. Storage states were not retained.

The run is initial characterization, not completion of the full packet.
Anonymous, integrator/team-leader, Super Admin, disabled-staff, and
service-principal cases remain `Inconclusive`; baseline cutoff, repeated
timings, query plans, and RBAC/Client Health/TOM review remain open.

This is execution authorization, not blanket authorization for migrations,
ghost-contact promotion, permission changes, or production observation. The
next run, if needed, must remain within the same QA-only boundary and address
the residual matrix explicitly.

### A8 — Client Health semantic gates

Consultant operational input remains outstanding. Until it arrives, do not
set health thresholds, confidence semantics, cohorts, coverage floors,
annotator/label policy, temporal holdouts, or pilot acceptance. Forecast jobs
remain stopped and consumers remain unavailable where the evidence packet says
the source tables are empty.

## Settled decisions and parked findings

These are not part of the current approval sequence:

- Phase 4 slices 1–8 are closed; no slice 9 is planned.
- `tenant_members` future authority, `tenant_csc_assignments` ownership,
  legacy tenant-column status, internal-staff broad-read semantics, and
  package/stage assignment relations are settled as recorded above.
- The 72 tenant-less users, 349 orphan membership rows, and 28 CSC ownership
  discrepancies remain preserve-and-hold. They are not silently resolved and
  do not authorize migration.
- Ghost-contact dry-run execution requires its own QA credential/operator/
  artifact/manual-review approval.
- Forecast replacement/shadow work requires separate approval; forecast jobs
  remain stopped.
- `AdminStageDetail.tsx` remains an owner/oracle analysis candidate, not an
  unattended behavior-bearing extraction target.

## Continuous implementation plan after approval

Once A1–A6 are resolved and A5 is either authorized or explicitly parked:

1. finalize the bounded package-instance/client-stage characterization packet;
2. complete the missing QA identity/operator/artifact gates and run one safe
   read-only QA pass with the current path authoritative;
3. write a separate implementation packet for only the verified smallest row;
4. implement with direct server allow/deny evidence, rollback, audit owner,
   and full verification; and
5. continue TOM P1.1 and Client Health preparation in parallel, without
   reopening settled decisions or touching the held security/forecast paths.

No continuous mode may bypass a missing product, TOM, security, fixture, or
external-data decision. “Unattended” applies only to documentation, static
analysis, test design, and explicitly authorized low-risk implementation.

## Verification

Documentation-only register. Before review, run:

```text
node scripts/check-kb-links.mjs
node scripts/check-kb-doc-size.mjs
git diff --check
```

Frontend, Edge, database, authorization, credential, and live-mutation
verification are not applicable. Hosted QA data was seeded only in the
allowlisted non-production project; the browser/query characterization run
remains pending its separate preflight gates.
