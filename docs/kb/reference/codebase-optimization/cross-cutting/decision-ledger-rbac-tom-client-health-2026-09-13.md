# Cross-initiative decision ledger — RBAC, TOM, and Client Health

> **Last updated:** 2026-09-13 · **Status:** active decision register; A1 settled, A2 is the current discussion; no runtime, authorization, schema, credential, hosted-QA, pilot, or production state changed
> **Purpose:** one canonical ledger for the remaining decisions Carl must approve, review, or analyze before continuous implementation
> **Inputs:** [RBAC P1-s resource dispositions](../../rbac-v6/p1/p1-s-aj-csc-resource-disposition-recommendation.md), [RBAC P1-r read-resource QA gate](../../rbac-v6/p1/p1-r-aj-csc-read-resource-decomposition-and-qa-gate.md), [RBAC P1-q live read-boundary reconciliation](../../rbac-v6/p1/p1-q-aj-csc-live-read-boundary-reconciliation.md), [approval-unblock matrix](approval-unblock-matrix-2026-09-12.md), [unattended-preparation authorization matrix](unattended-preparation-authorization-matrix-2026-09-13.md), [Program Index](../../program-index.md)
> **Owners:** Carl for product/policy approvals; RBAC for capability and server-boundary design; TOM for relationship semantics; Client Health for metric/data semantics; security for privileged-boundary review
> **Evidence baseline:** `origin/main` at the time of this packet; live read-only Supabase metadata reconciled 2026-09-13
> **Audit entry:** none needed — planning and decision tracking only; no operational or production state changed

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
| **A2** | Authorize bounded read-only QA | **current discussion** | Approve characterization only for package instances and client stages; no grants, routes, RLS/RPC changes, or implementation | QA packet and fixture definition |
| **A3** | Select QA fixture/personas/owners | awaiting Carl | Name QA tenant/resources, active AJ/CSC, ordinary CSC, client, disabled/expired, wrong-tenant, inactive-membership, anonymous, and Super Admin cases; name operator, security reviewer, artifact owner, and rollback owner | Safe execution preflight |
| **A4** | Define internal-staff visibility for these resources | awaiting Carl/TOM | Decide whether internal staff may read all package instances/client stages across tenants; do not infer write/export/publish/assignment authority | Relationship and negative-case assertions |
| **A5** | Authorize the security-boundary investigation | awaiting Carl/security | Read-only investigation of stage privileged RPCs, disabled-principal behavior, anonymous ACL/policy mismatch, view transitivity, and inactive-membership enforcement | Separate security findings/remediation decision |
| **A6** | Classify client stage state | awaiting Carl/Client Health | Decide whether stage status/date/node state is Client Health operational evidence, client-facing data, or both | Cross-initiative ownership and metric handling |
| **A7** | Authorize TOM hosted-QA preflight | awaiting Carl/TOM | Only after QA URL/ref, short-lived identities, fixture/reset plan, operator/window, and private artifact retention are specified | One read-only `unicorn-qa` run |
| **A8** | Resolve Client Health semantic gates | awaiting external data/Carl | Keep thresholds, cohorts, confidence semantics, and pilot acceptance gated on consultant operational input | H1 metric/corpus decisions and later implementation |

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

### A2 — bounded read-only QA

Approve only a characterization packet for `package.instances.view` and
`client.stages.view`. The current path remains authoritative. The packet may
read and assert allow/deny behavior, but may not add v6 grants, change RLS or
RPCs, publish Realtime tables, change routes, write fixtures, or mutate
production.

Required output: direct server assertions, trusted subject/target resolution,
negative cases, audit/error outcome, and an explicit list of inconclusive
cases.

### A3 — QA fixture and ownership

The fixture must be safe, isolated, resettable, and privately reviewable. The
minimum matrix is active AJ/CSC, ordinary CSC, client, disabled/archived/
expired/revoked, wrong tenant, wrong package/instance, inactive membership,
anonymous, and Super Admin. The packet must name the operator, security
reviewer, private artifact owner/retention, and rollback owner.

No hosted execution should begin while any of those fields is missing.

### A4 — internal-staff visibility

Decide the read scope for the exact package-instance and client-stage
resources. ADR-030 settles broad internal-staff reads where its scope applies,
but does not automatically authorize learner identity, sensitive progress,
exports, writes, publish/apply, assignment, or lifecycle operations.

TOM's settled relationship model remains the input: `tenant_members` is the
future membership/access authority; `tenant_csc_assignments` is current CSC
ownership; the legacy tenant column is history/compatibility; and
`package_instances`/`stage_instances` are authoritative service-assignment
relations.

### A5 — security-boundary investigation

Authorize a separate read-only security packet covering:

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

### A6 — client stage state ownership

Client Health must classify stage status, dates, and node state before those
fields are used in a capability or metric contract. The choices are:

- operational Client Health evidence;
- client-facing learning/workflow state; or
- both, with separate visibility and purpose limitations.

The classification must include freshness expectations because the inspected
tables are not present in Realtime publication metadata.

### A7 — TOM hosted-QA preflight

The read-only `unicorn-qa` run is gated on a concrete URL/ref, short-lived
identities, fixture/reset approval, operator and time window, private artifact
owner, and retention policy. This is execution authorization, not a blanket
authorization for migrations, ghost-contact promotion, permission changes, or
production observation.

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

Once A1–A4 are resolved and A5 is either authorized or explicitly parked:

1. finalize the bounded package-instance/client-stage characterization packet;
2. run one safe read-only QA pass with the current path authoritative;
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

Frontend, Edge, database, authorization, credential, hosted-QA, and live
mutation verification are not applicable because no runtime or environment
changed.
