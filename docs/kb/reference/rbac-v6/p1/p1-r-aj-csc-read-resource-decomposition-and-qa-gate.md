# RBAC v6 — Packet P1-r: AJ/CSC read-resource decomposition and QA gate

> **Last updated:** 2026-09-13 · **Status:** decision-preparation packet; no golden row, capability, role, route, RLS, RPC, Edge, pilot, or production state changed
> **Parent:** [RBAC v6 Authorization Implementation and Gate-Streamlining Plan](../../rbac-v6-authorization-implementation-plan-2026-09-01.md)
> **Inputs:** [P1-q live read-boundary reconciliation](p1-q-aj-csc-live-read-boundary-reconciliation.md), [P1-l golden-matrix review draft](p1-l-aj-csc-golden-matrix-review-draft.md), [P1-j AJ/CSC shadow contract](p1-j-aj-csc-shadow-evidence.md), [P1-k source-boundary preparation](p1-k-aj-csc-source-boundary-preparation.md), [TOM P0.1 source inventory](../../../codebase-state/tenant-p0-source-inventory.md), [Program Index](../../program-index.md)
> **Owner:** RBAC v6; TOM owns relationship semantics; product/security own action sensitivity and server-boundary approval
> **Source baseline:** `origin/main` at the current branch start, including PR #1242 (`daae100f325f129578dbd9073b6609e7497d0626`)
> **Evidence cutoff:** live read-only Supabase metadata reconciled 2026-09-13
> **Audit entry:** none needed — analysis and test-design documentation only; no authorization, schema, credential, hosted QA, or production action

## Purpose and decision boundary

The live reconciliation confirmed that the four historical read names do not
map one-to-one to four safe authorization resources. This packet turns that
finding into a finite review and QA gate. It proposes resource classes and
test cases for product, TOM, RBAC, and security to accept, reject, or refine.

This packet does not authorize the proposed rows. It does not add frontend
gates, alter RLS or grants, modify RPCs, publish Realtime tables, run actor
probes, enroll a pilot, or change production state. A successful query, route
render, or view invocation is not an authorization oracle.

## Live facts carried forward

The current deployed metadata establishes these facts:

- `packages`, `stages`, `package_stages`, and `stage_versions` have RLS
  enabled but also have unconditional authenticated SELECT policies.
- `package_instances` has forced RLS and a tenant-access/Super-Admin SELECT
  policy; `client_package_stages` and `academy_enrollments` have narrower
  relationship-sensitive reads.
- `academy_lesson_progress` has a staff-or-owner `ALL` policy, so read
  capability design must not inherit learner write authority.
- `v_client_package_stages` and `v_academy_course_progress` are
  `security_invoker=true` views. They have no direct RLS, but invoker table
  policies apply; their composite fields are more sensitive than catalogue
  metadata.
- `fn_academy_enrollment_stats()` is a `SECURITY DEFINER` function with an
  explicit Vivacity check. Four stage-related `SECURITY DEFINER` functions
  have authenticated execute privilege and require separate caller-boundary
  review.
- The inspected Academy and stage relations do not appear in current
  Realtime publication metadata.

These facts are evidence for review, not a proposal to preserve or remediate
the current state. Any security fix needs its own authorized packet.

## Proposed resource decomposition

The following classes are the smallest useful starting point. They are
deliberately resource-oriented rather than route-oriented; one page may
consume several classes, and a class may be used by several initiatives.

| Proposed resource class | Includes | Excludes | Candidate action | Initial disposition | Primary owner |
| --- | --- | --- | --- | --- | --- |
| Global catalogue metadata | Names, descriptions, status, non-sensitive package/stage template fields | Tenant instance state, learner/progress detail, publish/apply effects | `packages.catalogue.view`, `stages.catalogue.view` | `needs_cross_initiative_contract` because current authenticated reads are broad and product sensitivity is not classified | Product + TOM |
| Package/stage mapping | `package_stages`, package-to-stage ordering, mapping metadata | Client instance status, learner data, stage publication | `packages.mapping.view`, `stages.mapping.view` | `needs_cross_initiative_contract`; mapping is reused by Academy, client, documents, tasks, ClickUp, and Ask Viv | TOM + RBAC |
| Tenant-owned package instance | `package_instances`, tenant/client lifecycle and instance membership | Global catalogue, unrelated tenant instances, builder administration | `package.instances.view` | `needs_enforcement_inventory`; current tenant helper policy must be verified with negative principals | TOM + security |
| Client stage instance | `client_package_stages` and `v_client_package_stages` status/date/node state | Global stage templates and stage-version administration | `client.stages.view` | `needs_enforcement_inventory`; relationship and view access need direct QA | TOM + Client Health/product |
| Academy learner/progress record | `academy_enrollments`, `academy_lesson_progress`, and learner-facing progress projection | Global course catalogue, staff administration, enrollment writes | `academy.enrolments.view`, `academy.progress.view` | `needs_enforcement_inventory`; direct rows, composite view, and staff/owner split must be tested separately | RBAC + security |
| Academy aggregate analytics | `fn_academy_enrollment_stats()` and any aggregate-only projection | Learner-level records and mutation capability | `academy.enrolments.analytics.view` | `needs_product_input` plus `needs_enforcement_inventory`; aggregate sensitivity and Vivacity-only rule need explicit acceptance | Product + security |
| Stage-version history | `stage_versions`, diffs, published snapshots | Publish/apply operation and package assignment | `stages.versions.view` | `needs_enforcement_inventory`; current unconditional read and privileged diff RPC need direct review | Security + product |

The names above are proposals for discussion, not new entries in the
permission catalogue. If product chooses different names, the target and
boundary must remain equally explicit.

## Cross-initiative ownership questions

The following questions must be answered once and referenced by every
initiative that consumes the same resource. They prevent TOM, RBAC, Client
Health, and Academy from independently defining different meanings for
“tenant,” “client stage,” or “package access.”

| Question | Why it matters | Required decision owner |
| --- | --- | --- |
| Is a package/stage template global, tenant-owned, or both by lifecycle state? | Determines whether catalogue rows may be visible across tenants and whether internal staff broad reads are intended. | TOM + product |
| What relationship grants a consultant access to a package instance or client stage? | A route role or tenant assignment label is not server-derived relationship proof. | TOM |
| Does internal staff visibility include learner identity, progress, certificates, and tenant contact data? | The current staff branches are broader than ordinary client access. | Product + security |
| Are Academy mappings and client package instances one resource or separate resources? | The same package/stage rows are reused across administration and client workflows. | TOM + RBAC |
| Is aggregate Academy analytics allowed for any staff role, or only a named internal cohort? | `fn_academy_enrollment_stats()` has a Vivacity check but its product ownership is not established. | Product + security |
| Are stage versions ordinary reads or sensitive release artifacts? | Current authenticated SELECT and `SECURITY DEFINER` diff/publish functions create different risk levels. | Security + product |
| Is absent Realtime publication intentional? | Frontend subscriptions cannot be treated as a complete freshness/authorization path without an operational explanation. | Engineering + product |

ADR-030's internal staff-tenant-read decision should be applied as a
relationship input, not as blanket approval for sensitive learner reads,
exports, writes, publish, assignment, or lifecycle actions.

## QA gate for each surviving row

For every resource class that product/TOM/security accepts, the implementation
packet must name a QA-safe tenant/resource fixture and execute the following
matrix against the actual first server boundary. The matrix is a design gate;
no live probes were run in this packet.

| Subject | Positive case | Required negative cases |
| --- | --- | --- |
| Active AJ/CSC pilot principal | Approved resource and action within the named tenant/package/course/stage relationship | Wrong tenant, wrong package/instance, wrong course/stage, unrelated learner, unapproved resource class |
| Active CSC outside pilot | Existing baseline behavior only where explicitly retained | Every pilot-only row, aggregate analytics if not approved, version/admin reads if not approved |
| CSC assistant | Any expressly approved ordinary read | Learner identity/progress breadth, staff directory, publish/version admin, cross-tenant resource |
| Integrator/internal staff | Named operational resources within approved staff scope | Permission administration, secrets, exports, destructive lifecycle, unrelated tenant if TOM excludes it |
| Client Admin/User | Own tenant/client learning resources only | Staff/tenant directory, builder/catalogue administration, other tenant/package/learner |
| Super Admin | Explicitly approved hard-control read | Disabled/archived principal, stale or wrong target, missing audit context |
| Disabled/archived/expired/revoked principal | None | Direct table, view, RPC, cached route, replay, and stale-token access |
| Unauthenticated/anonymous caller | None unless separately approved as public metadata | Every sensitive table/view/RPC; record whether ACL and policy alignment produces denial |
| Machine/automation principal | Only its fixed named workflow, if approved | Human-role reuse, browser impersonation, unallowlisted target, replay |

Each case must capture the trusted subject and target resolution, decision
reason, tenant/resource context, result, audit/error outcome, and—if shadowed—
latency and mismatch category. A UI route reaching a page does not replace a
direct server allow/deny assertion.

## RPC, view, and freshness sub-gates

The read matrix is incomplete unless these server-side paths are tested
separately:

1. Invoke `v_academy_course_progress` as client, qualifying tenant contact,
   ordinary CSC, Vivacity staff, disabled/expired principal, and anonymous;
   verify learner, tenant, progress, and certificate fields independently.
2. Invoke `v_client_package_stages` with own and wrong tenant/package-instance
   context; verify that `security_invoker=true` produces the intended result.
3. Probe `fn_academy_enrollment_stats()` for its explicit staff guard and
   confirm that aggregate output is not treated as learner-row authority.
4. Have security review and separately authorize probes for
   `publish_stage_version`, `get_stage_version_diff`,
   `apply_stage_version_to_package`, and `can_edit_certified_stage`; the
   current metadata shows authenticated execute and the returned definitions
   did not visibly show caller guards before privileged logic.
5. Establish whether the absent Realtime publication is intentional and what
   refresh/consistency contract applies. Do not add publication entries as a
   side effect of this authorization review.

## Shadow and rollback requirements

If a bounded pilot is approved, use the existing [P1-j shadow
contract](p1-j-aj-csc-shadow-evidence.md): retain the current path as
authoritative, evaluate v6 against the same trusted subject/target context,
and compare sanitized decisions for the agreed observation period. Exit
requires zero unexplained cross-tenant allows, zero unexplained lockouts,
correct disabled/expired/revoked behavior, complete audit evidence, and
named owner sign-off.

Rollback is observational and reversible: revoke the pilot grant or disable
the approved profile while the current path remains authoritative. Never
restore access for a revoked principal or use a frontend route change as a
rollback for a server-boundary defect.

## Decision requested

Product, TOM, RBAC, and security should return one disposition per proposed
resource class:

- accept the class and proposed action name;
- merge it with another class only if target, sensitivity, and server
  boundary are genuinely identical;
- split it further if it combines catalogue, tenant, learner, or release
  state; or
- park it pending an ADR, security remediation, or Client Health/TOM input.

No class is `implementation_ready` until the decision includes named scope,
relationship semantics, first server boundary, negative cases, audit owner,
pilot/rollback owner, and any required security remediation. The four legacy
names remain parked at their prior dispositions until then.

## Verification

Documentation-only packet. Before review, run:

```text
node scripts/check-kb-links.mjs
node scripts/check-kb-doc-size.mjs
git diff --check
```

Frontend, Edge, database, authorization, credential, hosted-QA, and live
mutation verification are not applicable because no runtime or environment
changed.
