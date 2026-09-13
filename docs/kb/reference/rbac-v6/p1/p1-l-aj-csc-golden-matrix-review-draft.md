# RBAC v6 — Packet P1-l: AJ/CSC golden-matrix review draft

> **Parent plan:** [RBAC v6 Authorization Implementation and Gate-Streamlining Plan](../../rbac-v6-authorization-implementation-plan-2026-09-01.md) — §7 P1, §12 P4
> **Inputs:** [P1-c sequencing worksheet](p1-c-capability-enforcement-sequencing.md), [P1-d enforcement ledger](p1-d-static-enforcement-ledger.md), [P1-e verb decomposition](p1-e-bundled-verb-decomposition.md), [P1-h high-risk controls](p1-h-high-risk-delegability-control-worksheet.md), [P1-i seat/pilot worksheet](p1-i-job-role-defaults-aj-csc-pilot.md), [P1-j shadow contract](p1-j-aj-csc-shadow-evidence.md), [P1-k source-boundary preparation](p1-k-aj-csc-source-boundary-preparation.md), [TOM P0.1 source inventory](../../../codebase-state/tenant-p0-source-inventory.md)
> **Program index:** [Program Index](../../program-index.md)
> **Status:** preparation draft delivered 2026-09-13 — reviewable candidate rows and evidence checklist; no golden policy row approved, grant, role, route, RLS, RPC, Edge, credential, pilot, or production state changed
> **Owner:** RBAC v6 with product/security approval; TOM owns tenant/resource relationship semantics
> **Evidence cutoff:** `origin/main` at branch start; source-backed references are carried from P1-d/P1-e/P1-i/P1-k
> **Audit entry:** none needed — analysis/documentation only; no authorization, schema, credential, hosted QA, or production action

## Purpose and boundary

This packet consolidates the source-backed AJ/CSC candidate rows into a single
review worksheet. It is deliberately a *draft* rather than the golden access
matrix: a candidate row remains out of policy until product/security confirms
the action, scope, relationship, delegability, and owner.

The draft is intended to make the next review finite. It records the first
privileged boundary, the current evidence state, the minimum named-scope
placeholder, and the negative cases that an eventual implementation packet
must prove. It does not copy a route role into a capability grant and does not
turn broad internal-staff read access into broad AJ/CSC write access.

## Readiness vocabulary

| State | Meaning in this draft |
| --- | --- |
| `needs_enforcement_inventory` | A source or route entry exists, but the trusted server boundary, caller check, or effective RLS is not yet reconciled. |
| `needs_cross_initiative_contract` | The row depends on TOM tenant/package/stage identity, ownership, or membership semantics that are not yet a versioned authorization contract. |
| `needs_product_input` | The current behavior bundles distinct actions or does not establish the intended target/scope. |
| `needs_security_review` | The action is destructive, publish-like, export-like, externally consequential, or machine/high-blast-radius. |
| `implementation_ready` | Not used in this draft. It requires approved policy, direct positive/negative boundary evidence, rollback, and the named pilot gates. |

Unknown or conflicting evidence stays unresolved. No row below authorizes a
role default, capability grant, pilot enrollment, route change, or server
cutover.

## Candidate matrix for review

The initial AJ/CSC read set is intentionally small. Write rows are listed only
to prevent accidental inheritance from a broad `manage` label; they remain
held until their action and target contracts are separately approved.

| Candidate action | Target and scope placeholder | First boundary to prove | Current evidence / readiness | Required negative cases | Decision owner |
| --- | --- | --- | --- | --- | --- |
| `academy.builder.view` | Named Academy course/draft resources in an approved tenant or QA cohort; no global write implication | Protected route plus `AcademyBuilderLibrary`/`AcademyBuilderCourse` reads; then effective RLS and any RPC/Edge boundary | Route uses `ACADEMY_BUILDER_ROLES`; no direct v6 feature-key gate; P1-k source-backed, **`needs_enforcement_inventory`** | Client/disabled/expired principal, wrong tenant/course, BGT/CET/Team Member without an approved row | Product + security; TOM for tenant/course binding |
| `academy.enrolments.view` | Named learner/course records in an approved tenant or QA cohort | `useAdminEnrollments` reads and progress/stats RPCs; then RLS/RPC caller and tenant checks | Route role carries the read surface; no explicit v6 view gate; P1-k source-backed, **`needs_enforcement_inventory`** | Client outside own tenant, wrong tenant/course/learner, disabled/expired principal, hidden-page direct read | Product + security; TOM for learner/tenant relationship |
| `academy.mapping.view` | Named package/course mapping resources and their approved tenant context | Package-course rules route and its read hook; effective mapping/package RLS and target resolution | Route key exists but underlying package/course boundary needs reconciliation; **`needs_cross_initiative_contract`** | Wrong tenant/package/course, client or inactive principal, route bypass, unapproved unpublished mapping visibility | TOM + product/security |
| `packages.view` | Named package catalogue or package-instance resources; distinguish catalogue from tenant-owned instance | `usePackagesActive` and `useAcademyBuilderPickers`, then package-instance-to-tenant resolver and RLS | No direct feature-key gate in the inspected mapping path; **`needs_cross_initiative_contract`** | Other tenant/package instance, client access beyond approved relationship, disabled/expired principal | TOM + RBAC/product |
| `stages.view` | Named stage/package/client resources with a verified package-to-tenant relationship | `useStageVersions` and stage detail reads; then stage/package RLS and RPC boundaries | No direct v6 gate found in inspected editor path; **`needs_cross_initiative_contract`** | Wrong tenant/package/stage, client outside approved learning scope, disabled/expired principal | TOM + security |
| `academy.builder.edit` | Named course draft and approved tenant/resource scope; never inferred from builder route access | Course editor writes and any direct table/RPC/Edge writer | Publish/delete/edit branches are behavior-bearing and not yet split into an atomic server contract; **`needs_product_input`** | Read-only persona, wrong tenant/course, stale version, unauthorized field, disabled/expired principal, replay | Product + security |
| `academy.builder.publish` | Named course/package target, explicit publication scope and audit owner | Publish-on-save and course-status writer, including downstream effects | Consequential state transition; **`needs_security_review`** | Unapproved publisher, wrong tenant/package, incomplete/invalid course, duplicate/replay, missing audit, disabled/expired principal | Security + product |
| `academy.enrolments.create` | Named learner/course and approved tenant relationship; tenant-wide enrollment is not implied | Single insert, bulk upsert, and tenant expansion paths in `useEnrollUser`/`useBulkEnroll`/`useEnrollTenant` | Frontend gate exists but direct writes and tenant expansion have distinct semantics; **`needs_cross_initiative_contract`** | Wrong tenant/learner/course, duplicate request, client/admin boundary, inactive principal, partial bulk success | TOM + security |
| `academy.enrolments.revoke` | Named enrollment or learner/course target with explicit reason and audit | Revoke/reactivate/extend RPCs; separate export path | Same key is reused for CSV export and several consequential operations; **`needs_product_input`** | Wrong tenant/learner, unauthorized export, replay, missing reason/audit, disabled/expired principal | Product + security |
| `academy.tenant_access.view` | Named tenant/cohort entitlement resources | Tenant-access read path and target resolver | Candidate decomposition of `academy.tenant_access.manage`; **`needs_cross_initiative_contract`** | Other tenant, client caller, inactive principal, hidden-page direct read | TOM + RBAC |
| `academy.tenant_access.edit` | Named tenant/cohort settings with explicit owner | Settings update writer and audit path | Candidate decomposition only; no approved target contract; **`needs_product_input`** | Unnamed tenant, wrong owner, client caller, stale update, missing audit, disabled principal | Product + TOM + security |
| `academy.tenant_access.enable_disable` | Named tenant/cohort entitlement and explicit transition reason | Enable/disable writer, downstream access effects, rollback | Access changes are consequential and cannot inherit `manage`; **`needs_security_review`** | Wrong tenant, unapproved lifecycle transition, replay, partial downstream update, disabled principal | Security + product/TOM |
| `stages.edit` | Named stage/package resources with explicit relationship | Stage editor writes and underlying RPC/table boundary | Source-backed candidate; package/tenant binding and audit behavior not complete; **`needs_cross_initiative_contract`** | Wrong tenant/package/stage, client/admin mismatch, stale version, disabled/expired principal | TOM + security |
| `stages.publish` | Named stage version and explicit package impact | `publish_stage_version`, `get_stage_version_diff`, `apply_stage_version_to_package` RPCs | Publish/apply can affect multiple packages and client work; **`needs_security_review`** | Wrong package/tenant, uncertified stage, stale version, replay, missing audit/rollback, disabled principal | Security + TOM + product |
| `stages.assignment.manage` | Named stage/package/client assignment set; no global assignment | Assignment writer and relationship resolver | Candidate only; assignment semantics depend on TOM ownership and package state; **`needs_cross_initiative_contract`** | Other tenant/client, unapproved bulk assignment, duplicate/replay, disabled/expired principal | TOM + product/security |

## Scope and relationship placeholders

Before any row can become a golden row, the review record must replace these
placeholders with concrete values without placing sensitive identifiers in the
ordinary matrix:

1. a QA-safe cohort or named pilot tenants/resources;
2. the subject profile (AJ, CSC consultant, CSC assistant, Integrator, client,
   machine, or disabled/expired principal);
3. the server-derived tenant, package, course, stage, learner, and ownership
   relationship;
4. the action-specific target resolver and policy version;
5. the effective RLS/RPC/Edge boundary and its audit behavior; and
6. the review owner, expiry, observation artifact, and rollback owner.

The TOM assignment label is not sufficient relationship proof. ADR-030 allows
broad internal-staff reads, but it does not authorize sensitive writes,
publish, export, lifecycle, assignment, or tenant-access changes.

## Required synthetic review cases

The following cases apply to every candidate row that survives product/security
review. They are design requirements, not evidence that the current system
already passes them.

| Persona/state | Allow case | Deny/negative cases |
| --- | --- | --- |
| Active AJ/CSC pilot | Exact approved read or smallest approved write on a named resource | Other tenant/resource, unapproved action, expired scope, missing relationship |
| Active CSC without pilot exception | Existing baseline operation only | Every pilot-only write and high-risk action |
| CSC assistant | Same approved ordinary operation as CSC | Unapproved AI-context breadth, high-risk action, wrong target |
| Integrator | Approved operational/EOS action if separately in scope | Permission administration, secrets, export, destructive lifecycle |
| Client Admin/User | Own approved learning/enrollment behavior | Staff directory, other tenant, builder administration unless explicitly approved |
| Super Admin | Explicit hard-control operation with active principal | Disabled/archived principal, self-approval, stale target, missing reason/audit |
| Disabled/archived/expired principal | None | All reads/writes, cached request, replay, and route bypass |
| Machine/automation principal | Its one fixed named workflow | Browser impersonation, human-role reuse, unallowlisted target, replay |

Each case must record the trusted subject/target resolution, decision reason,
tenant/resource context, latency where shadowed, and audit/error outcome. A
page render or route reachability check is not an authorization oracle.

## Shadow, rollback, and approval gates

If product/security approves a bounded pilot, the implementation packet must
use [P1-j's shadow contract](p1-j-aj-csc-shadow-evidence.md): current behavior
remains authoritative, v6 evaluates the same trusted context, and sanitized
events are compared for 14 days. The required gates are:

- zero unexplained v6-only allows;
- zero unexplained legacy-allow/v6-deny lockouts;
- no mismatch for disabled, archived, expired, revoked, unknown, or
  missing-context principals;
- no cross-tenant or wrong-resource allow;
- positive and sensitive-negative server probes for every approved action;
- complete, deduplicated audit/approval/expiry evidence; and
- named pilot owner sign-off on workflow success and usability.

Rollback is observational: keep the current path authoritative, revoke the
pilot grant or disable the approved profile, and correct the mismatch. Never
restore access for a revoked/disabled principal or re-enable a known fail-open
helper. Route and navigation changes remain last and separately revertible.

## Review checklist and stop boundary

Product/security/TOM review must explicitly confirm:

- candidate action names and any required decomposition;
- named scope and relationship semantics for each surviving row;
- whether each row is read, ordinary write, publish, export, assignment, or
  high-risk and therefore separately gated;
- the server-boundary owner and direct negative probe plan;
- pilot personas, safe resources, 14-day shadow owner, artifact retention,
  reviewer access, and rollback owner; and
- which rows are rejected, parked, or returned for more evidence.

Until that review exists, every row in this packet remains non-authoritative.
No role/default/grant activation, telemetry or logger creation, hosted QA run,
route change, RLS/RPC/Edge change, migration, or production observation is
authorized. Safe follow-up is to refine source evidence and synthetic test
fixtures against the confirmed rows; any runtime implementation needs a new,
separately approved bounded packet.

## Verification

Documentation-only packet. Run `node scripts/check-kb-links.mjs`,
`node scripts/check-kb-doc-size.mjs`, and `git diff --check` before review.
Frontend, Edge, database, authorization, credential, hosted-QA, and live
verification are not applicable because no runtime or environment changed.
