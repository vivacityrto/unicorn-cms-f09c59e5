# RBAC v6 — Packet P1-i: job-role defaults and AJ/CSC pilot worksheet

> **Parent plan:** [RBAC v6 Authorization Implementation and Gate-Streamlining Plan](../../rbac-v6-authorization-implementation-plan-2026-09-01.md) — §5.6, §7 P1, §12 P4
> **Inputs:** [P1-c enforcement and sequencing worksheet](p1-c-capability-enforcement-sequencing.md), [P1-d static enforcement ledger](p1-d-static-enforcement-ledger.md), [P1-e bundled-verb decomposition](p1-e-bundled-verb-decomposition.md), [P1-h high-risk delegability controls](p1-h-high-risk-delegability-control-worksheet.md), [P1-j shadow evidence contract](p1-j-aj-csc-shadow-evidence.md), [R2 approval packet](../../codebase-optimization/cross-cutting/remaining-gated-approval-packets-2026-09-12.md)
> **Program index:** [Program Index](../../program-index.md)
> **Status:** preparation worksheet delivered 2026-09-13 — policy baseline translated into reviewable bundle/pilot gates; no role or capability grant, route, RLS, or pilot state changed
> **Owner:** Product/operations + Carl/Vivacity, with security review of the pilot and golden matrix
> **Evidence:** parent-plan §13.1 baseline and current P1 source ledgers at `origin/main@c5bd48213fb70868dff05027e284952901d5ea15`
> **Audit entry:** none needed — analysis/documentation only; no authorization, schema, credential, hosted QA, or production action

## Purpose and boundary

R2-e combines two related but separate decisions: define stable job-role
defaults, and run the first AJ/CSC pilot. This packet converts the policy
baseline already recorded in the parent plan's §13.1 into a concrete review
shape. It does not treat current role rows as future policy and does not grant
any capability.

The recommended sequence is:

1. approve the seat vocabulary and bundle boundaries;
2. version the golden action/scope/relationship matrix;
3. characterize one AJ/CSC vertical workflow at the server boundary;
4. run a 14-day non-authoritative shadow comparison with approved personas;
5. review mismatches and only then consider a narrowly scoped pilot exception.

No ordinary role default or pilot grant should be activated before those gates.
The standing rule remains: broad internal-staff read access is permanent policy,
but assignment is not silently converted into a sensitive-write authorization
boundary.

## Baseline being translated

The parent plan's current disposition records these operating decisions:

- CSC consultant and CSC assistant share the baseline CSC bundle; an assistant
  subtype may add approved AI-context breadth without changing ordinary client
  operation rights.
- Integrator is the canonical internal-operations profile, including EOS/KPI
  work. Team Leader retires into Integrator; Team Member is migration-only; CET
  is not an active seat because it has no current holders.
- BGT remains capability-based and is not a blanket elevated human role.
- Super Admin remains the hard control-plane role. Operational subtypes do not
  bypass hard-SA controls, and true break-glass remains a separate future
  design choice.
- Multiple approved profiles per person are allowed. Temporary narrow access is
  a time-bound capability grant, not an ad hoc second role assignment.
- High-risk temporary grants require two approvers; ordinary narrow operational
  grants may use one. Self-approval is prohibited. Defaults are 30 days for
  high-risk and 90 days for ordinary temporary grants, with quarterly review
  and explicit renewal.
- Disabled, archived, expired, inactive, unknown, or unavailable principals
  deny; session revocation and recovery remain part of the implementation gate.

This packet records that baseline as an input; it does not independently
re-authorize it or create the missing golden matrix.

## Proposed stable seat bundles

These are bundle boundaries for product/security review, not a list of grants
to apply to the current database. A blank or unresolved capability stays out of
the bundle rather than being inferred from a job title.

| Seat/profile | Baseline bundle boundary | Explicit exclusions | Evidence needed before activation |
| --- | --- | --- | --- |
| CSC consultant | Client-coordination reads and approved ordinary client operations within the target policy scope; add Academy/package/stage actions only where the approved workflow requires them | High-risk rows, permission/system administration, broad export, secrets, destructive lifecycle, unrelated executive routes | Representative CSC seat owner, atomic rows, target relationship, positive/negative persona fixture |
| CSC assistant | Same ordinary client-operation baseline as CSC consultant | No automatic privilege increase from “assistant”; high-risk rows and unapproved AI-context breadth remain excluded | Named assistant use case, data-sensitivity review, approved AI-context rows, same denial suite as CSC |
| Integrator | Explicit internal operations, EOS/KPI, approved integration coordination, and other reviewed operational capabilities | No blanket “all internal admin”; high-risk system/configuration, credential, export, migration, and permission-admin rows remain excluded unless hard-SA/protected workflow applies | Operational seat representative, per-family positive workflow, sensitive negative workflow |
| BGT | Only the approved bulk-generation machine/human workflow capabilities, with fixed target and output scope | Not a generic elevated human bundle; no unrelated admin/system/permission capability | Exact workflow owner, machine-versus-human classification, allowlist, idempotency and output audit |
| Team Leader | No new active default profile; migrate into Integrator semantics after affected users and capability differences are reconciled | No silent inheritance of historical Team Leader access; no privilege expansion during rename | Assignment inventory, parity comparison, explicit retirement/migration plan |
| CET | No active default profile; retain historical rows only as migration evidence until separately retired | No new assignments based on an inactive seat label | Confirm zero current holders and no automation dependency |
| Team Member | Migration-only compatibility state pending explicit retirement | No new grants or role defaults | Current-holder inventory, compatibility/retirement plan |
| Super Admin | Hard control-plane actions only, with explicit capability and target checks | Not a daily substitute for missing seat design; no self-approval or break-glass conflation | Hard-SA principal inventory, MFA/reauth, direct negative probes, separate break-glass decision |
| Automation profile | Dedicated minimum machine capabilities for one named workflow | Never use a machine profile as a convenient human supplemental role | Fixed principal, secret custody, allowlist, retry/idempotency, audit and revocation |

## AJ/CSC pilot profile — candidate rows, not grants

The pilot should test the original business case without assigning Super Admin
or an unrelated full role. The following are candidate atomic actions to put in
the golden matrix after source-boundary characterization:

| Capability family | Candidate actions | Candidate scope/relationship | Pilot disposition |
| --- | --- | --- | --- |
| Academy builder | `academy.builder.view`, `academy.builder.edit`, `academy.builder.publish` | Named Academy resources and approved tenant/client context; do not infer all-tenant write from current route allowlists | Include only the exact builder actions the AJ role needs; direct server probes required |
| Academy enrolment | `academy.enrolments.view`, `academy.enrolments.create`, `academy.enrolments.revoke` | Approved learner/tenant relationship and named course context | Include only if AJ workflow actually enrols or revokes; revocation remains separately reviewed |
| Academy mapping | `academy.mapping.view`, `academy.mapping.edit` | Named package/course mapping resources; target ownership and publication effect required | Treat edit as a separate write row; no inheritance from builder view |
| Academy tenant access | Decompose `academy.tenant_access.manage` into view, settings edit, enable/disable, and auto-enrol rules | Named tenants/cohort only; client-access changes require explicit owner and audit | Hold until the sub-action and tenant-access contract is approved |
| Packages | `packages.view` plus only the package create/edit/close or note/tick actions proven necessary | Named/approved tenants and package instances; assigned-tenant relationship is not automatic permission proof | Prefer read first; each write gets its own row and negative probe |
| Stages | Candidate `stages.view`, `stages.edit`, `stages.publish`, and `stages.assignment.manage` rows | Named stage/package/client resources with explicit relationship; no global stage write | These are plan candidates and are not yet active catalogue rows; add only through the golden-matrix review |

The pilot's recommended initial posture is **read plus the smallest demonstrated
write set**, with publish, revoke, tenant-access changes, stage assignment, and
other consequential operations held out unless the workflow proves they are
required. No capability should be included because a page happens to be
reachable today.

## Scope recommendation

The safe initial pilot scope is a named, approved set of tenants and Academy,
package, and stage resources, not global operational scope. “Assigned tenants”
may be used as a relationship predicate only after TOM's assignment source and
current-state semantics are versioned; it must not be assumed from a user's
portfolio label. Internal staff may retain broad read access under ADR-030 while
the AJ exception is limited to its approved writes.

The approval form must name:

- pilot tenant/resource IDs or a safe QA cohort;
- pilot personas and the seat/profile each represents;
- exact candidate capability rows and action level;
- relationship resolver used at each server boundary;
- start time, expiry/review time, and two approvers where high-risk is involved;
- observation owner, artifact location, redaction/retention, and escalation path.

## Shadow, acceptance, and rollback gates

Before any pilot grant or route change, run the v6 decision path in non-
authoritative shadow for 14 days while the current path remains authoritative.
The shadow must compare sanitized decisions, reason codes, target/scope context,
and latency; it must never combine old and new allows.

Required acceptance gates:

1. zero unexplained v6-only allows;
2. zero unexplained legacy-allow/v6-deny lockouts;
3. no mismatch involving a disabled, archived, expired, revoked, unknown, or
   missing-context principal;
4. no cross-tenant or wrong-resource allow;
5. every candidate workflow has a positive and sensitive-negative server probe;
6. audit/approval/expiry behavior is present and deduplicated; and
7. the pilot owner signs off on workflow success and operational usability.

The rollback is to keep the legacy path authoritative, revoke the pilot grant
or disable the approved profile, and correct the mismatch before reconsidering.
Rollback must not restore access for a revoked/disabled principal or rely on a
known fail-open helper. Route/nav changes are last and are separately
revertible; no pilot enrollment is authorized by this worksheet.

## Persona and negative-case matrix

| Persona | Positive case | Required denial cases |
| --- | --- | --- |
| Active CSC pilot | Approved Academy/package/stage action in approved scope | Other tenant/resource, unapproved publish/revoke/assignment, expired grant |
| Active CSC without pilot exception | Existing approved ordinary operation only | Pilot-only write, high-risk row, unrelated executive/admin route |
| CSC assistant | Same baseline operation as CSC where approved | Unapproved AI-context breadth, high-risk row, wrong tenant/resource |
| Integrator | Approved internal operational/EOS action | Permission administration, secret/configuration, export, destructive lifecycle |
| Super Admin | Hard control-plane action with active principal | Disabled/archived SA, self-approval, stale target, missing reason/audit |
| Client Admin/User | Own tenant and approved relationship behavior | Staff directory, other tenant, Academy builder administration unless explicitly named |
| Disabled/archived/expired principal | None | Every pilot and ordinary protected action, including cached/replayed request |
| Machine/automation principal | Only its fixed named workflow | Browser impersonation, human role reuse, unallowlisted tenant, replay/duplicate |

## Decisions and prerequisites

The packet is ready for product/security review when owners confirm:

- the seat boundaries above, including Team Leader/CET/Team Member migration
  treatment;
- the exact AJ/CSC candidate rows, with unresolved rows remaining out of the
  pilot rather than being guessed;
- the pilot scope, named resources/tenants, personas, and owners;
- the 14-day shadow window, zero-tolerance mismatch thresholds, artifact and
  review process;
- rollback ownership and grant-revocation procedure; and
- golden-matrix ownership and quarterly review cadence.

Until those are recorded, R2-e remains **preparation complete, implementation
blocked**. No grant, role assignment, or pilot enrollment is authorized by this
packet. Safe next work is source-boundary characterization, synthetic
persona/negative-case design, and golden-matrix drafting. It does not include
role assignment, capability grants, hosted pilot enrollment, route changes,
schema/RLS changes, Edge deployment, or production observation.

## Verification

Documentation-only change. Relevant checks are `node scripts/check-kb-links.mjs`,
`node scripts/check-kb-doc-size.mjs`, and `git diff --check`; runtime suites and
hosted QA are not applicable because no code, permission, credential, or live
environment changed.
