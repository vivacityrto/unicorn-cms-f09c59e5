# RBAC v6 — Packet P1-s: AJ/CSC read-resource disposition recommendation

> **Last updated:** 2026-09-13 · **Status:** recommendation-only worksheet; no golden row, capability, role, route, RLS, RPC, Edge, pilot, or production state changed
> **Parent:** [RBAC v6 Authorization Implementation and Gate-Streamlining Plan](../../rbac-v6-authorization-implementation-plan-2026-09-01.md)
> **Inputs:** [P1-r read-resource decomposition and QA gate](p1-r-aj-csc-read-resource-decomposition-and-qa-gate.md), [P1-q live read-boundary reconciliation](p1-q-aj-csc-live-read-boundary-reconciliation.md), [P1-l golden-matrix review draft](p1-l-aj-csc-golden-matrix-review-draft.md), [TOM P0.1 source inventory](../../../codebase-state/tenant-p0-source-inventory.md), [Program Index](../../program-index.md)
> **Owner:** RBAC v6 with TOM, product, and security review
> **Evidence cutoff:** `origin/main` at branch start; live metadata reconciled 2026-09-13
> **Audit entry:** none needed — analysis/documentation only; no authorization, schema, credential, hosted QA, or production action

## Purpose

P1-q established the deployed boundaries and P1-r decomposed the four broad
read names into seven resource classes. This worksheet gives Carl, TOM,
product, and security a concrete first disposition for each class so that
review can resolve one finite question at a time.

These are recommendations, not approvals. “Advance to bounded evidence” means
the class is worth characterizing with an approved QA-safe fixture; it does not
authorize a capability grant or server change. “Park” means retain the class in
the matrix while its relationship, sensitivity, or security boundary is
decided.

## Recommended dispositions

| Resource class | Recommendation | Why | Required condition before implementation |
| --- | --- | --- | --- |
| Global catalogue metadata | **Keep separate; park pending security/product classification** | `packages` and `stages` are broadly readable to authenticated users today, but catalogue fields are reused by Academy, client, documents, tasks, ClickUp, and Ask Viv. A single global read row could silently widen access across initiatives. | Name the exact fields, intended audience, cross-tenant rule, and server boundary. Run anonymous/authenticated effective-access probes before treating current broad reads as intended. |
| Package/stage mapping | **Keep separate; park pending TOM contract** | `package_stages` is a relationship table, not just catalogue data. Its authenticated unconditional SELECT policy is live, while mapping consumers have different tenant and client meanings. | TOM defines package-to-stage ownership and whether mappings are global templates, tenant-owned configuration, or client-visible data. Then test wrong-tenant/package cases. |
| Tenant-owned package instance | **Advance to bounded evidence** | `package_instances` has forced RLS and a tenant-access/Super-Admin SELECT policy, making it the cleanest candidate for a named tenant-scoped read row. | Verify `app.user_can_access_tenant` and `is_super_admin()` with approved active, wrong-tenant, disabled/expired, client, and internal-staff principals. Keep lifecycle writes separate. |
| Client stage instance | **Advance to bounded evidence, with TOM and Client Health review** | `client_package_stages` is already relationship-scoped, and `v_client_package_stages` is security-invoker. This is a coherent client-operational resource if stage status/date/node state is explicitly owned. | TOM defines the client/package-instance relationship; Client Health confirms whether stage state is operational evidence or client-facing data. Verify own/wrong tenant and stale/disabled cases. |
| Academy learner/progress record | **Split into enrolment and progress; park pending security review** | Enrollment identity and progress are distinct sensitivities. The live progress relation uses a staff-or-owner `ALL` policy, so a view row must not imply write authority. The composite view exposes learner, tenant, progress, and certificate data. | Separate read-only rows and prove direct table/view denial, staff scope, learner self-scope, wrong-tenant, and disabled/expired behavior. Any progress write remains separately gated. |
| Academy aggregate analytics | **Keep separate; park pending product/security decision** | `fn_academy_enrollment_stats()` is a `SECURITY DEFINER` function with a Vivacity check, but aggregate learner analytics may still be sensitive and is not automatically equivalent to enrollment-row access. | Decide who may see aggregates, whether tenant filters are required, and the audit/retention rule. Re-test the RPC boundary directly before implementation. |
| Stage-version history | **Keep separate; restrict to internal/admin until reviewed** | Version snapshots and diffs are release artifacts. Current authenticated unconditional SELECT exists, and related `SECURITY DEFINER` RPCs have authenticated execute privilege without a visibly explicit caller guard in the returned definitions. | Security reviews the four stage RPCs and names a read-only version audience. Direct RPC, wrong-package, stale-version, disabled/expired, and replay cases must pass before any row advances. |

## Why this order

The proposed order is based on boundary clarity and blast radius, not on the
convenience of matching existing route roles:

1. **Package instances and client stage instances first.** They have the
   clearest tenant relationship in current policies and can be tested as
   named resources without authorizing catalogue-wide or learner-wide reads.
2. **Catalogue and mapping second.** These need TOM's global-versus-tenant
   contract and a security decision about whether the current broad reads are
   intentional. They should not inherit access merely because an instance is
   visible.
3. **Enrolment/progress and analytics third.** Their data includes learner
   identity, tenant context, progress, and certificates, and their RPC/view
   paths need direct server evidence.
4. **Version history and privileged stage RPCs require a security gate first.**
   A frontend read key cannot compensate for an authenticated execute grant on
   a privileged function.

This ordering permits useful bounded evidence work while preserving the
decision gates around the high-sensitivity and high-blast-radius surfaces.

## Decisions requested

Carl/TOM/product/security can resolve this worksheet with one response per
row:

- **Accept** the recommended class and its owner;
- **Merge** it with another class only when target, sensitivity, relationship,
  and server boundary are identical;
- **Split** it further when a view or workflow combines different data or
  actions; or
- **Park** it pending an ADR, security remediation, Client Health input, or
  stronger live evidence.

The minimum response needed to start bounded evidence on the two recommended
first candidates is:

1. the TOM relationship for a package instance and client stage instance;
2. the approved QA-safe tenant/resource fixture;
3. whether internal staff may read across tenants for those exact resources;
4. the Client Health owner for client stage status if it is operational data;
   and
5. confirmation that all writes, exports, publish/apply actions, and RPC
   remediation remain out of scope.

## Explicit non-decisions

This worksheet does not approve or perform any of the following:

- adding or changing capability rows, role defaults, frontend gates, routes,
  RLS policies, grants, RPC bodies/ACLs, Edge functions, or Realtime
  publication;
- probing production with non-approved principals or fixtures;
- fixing the apparent anonymous ACL/policy mismatch;
- changing the stage `SECURITY DEFINER` functions; or
- enrolling a pilot or switching from shadow to authoritative enforcement.

Those actions require their own approved packet and, where applicable, an
audit-log entry.

## Verification

Documentation-only worksheet. Before review, run:

```text
node scripts/check-kb-links.mjs
node scripts/check-kb-doc-size.mjs
git diff --check
```

Frontend, Edge, database, authorization, credential, hosted-QA, and live
mutation verification are not applicable because no runtime or environment
changed.
