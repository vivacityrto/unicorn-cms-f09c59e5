# RBAC v6 — Packet P1-v: AJ/CSC read-boundary fixture contract

> **Last updated:** 2026-09-14
> **Status:** preparation-only named synthetic read-boundary evidence contract;
> no hosted run,
> credential, capability, role, route, RLS, RPC, Edge, pilot, or production
> state changed
> **Authorization:** documentation-only preparation of the bounded evidence
> contract; no hosted run, credential use, fixture seeding, capability/role
> change, telemetry, implementation, or production state change is authorized
> by this packet
> **Parent:** [RBAC v6 Authorization and Gate-Streamlining Plan](../../rbac-v6-authorization-implementation-plan-2026-09-01.md)
> **Inputs:** [P1-k source-boundary preparation](p1-k-aj-csc-source-boundary-preparation.md), [P1-r read-resource decomposition](p1-r-aj-csc-read-resource-decomposition-and-qa-gate.md), [P1-s resource disposition recommendation](p1-s-aj-csc-resource-disposition-recommendation.md), [TOM P0.2/P0.3 fixture contract](../../tenant-operating-model/p0/p0-2-p0-3-representative-query-fixture-contract-2026-09-13.md)
> **Owner:** RBAC v6, with TOM owning tenant/package/stage relationships and product/security owning policy approval
> **Audit entry:** none needed — documentation-only preparation; no live or hosted data action

## Purpose and boundary

P1-s identifies `package.instances.view` and `client.stages.view` as the
clearest first candidates for bounded evidence. This contract defines the
smallest synthetic fixture and result shape needed to test those candidates
without treating current route access, broad staff visibility, or a successful
query as proof of a future capability.

This is the named P1-v evidence slice for those read boundaries. Its scope
ends at documenting the fixture, cases, and approval gates; it does not
authorize execution of the future hosted run.

This is a test-design artifact, not an authorization decision. It does not
choose the final capability names, grant access, create telemetry, connect to
Supabase, seed fixtures, or approve a pilot. The hosted run remains separately
gated.

## Synthetic fixture manifest

Every future run must generate a unique `run_id` and use only identifiers
created for that run in an allowlisted non-production project. Values below
are stable labels, not real IDs.

| Fixture label | Synthetic shape | Purpose |
| --- | --- | --- |
| `tenant-a` | One active representative tenant | Positive package-instance and client-stage reads |
| `tenant-b` | Separate active tenant with the same display labels as tenant A | Tenant and name-collision isolation |
| `package-template-a` | Shared catalogue package/stage labels | Distinguish catalogue metadata from tenant-owned instances |
| `package-instance-a` | Active package instance owned by tenant A | Named `package.instances.view` target |
| `package-instance-b` | Equivalent package instance owned by tenant B | Wrong-tenant target |
| `client-stage-a` | Active client stage instance under package-instance-a | Named `client.stages.view` target |
| `client-stage-b` | Equivalent stage under package-instance-b | Wrong-package/tenant target |
| `disabled-subject` | Synthetic principal with disabled or revoked state | Stale-token and inactive-principal denial |
| `unrelated-subject` | Active principal with no approved relationship to tenant A | Relationship denial without relying on display labels |

The fixture must record the source commit, manifest hash, run tag, expected
relationship, and cleanup disposition. It must not contain production UUIDs,
real names/emails, browser storage state, service keys, invitation tokens, or
copied production rows.

## Persona and case matrix

Until product/TOM/security supplies the missing target and relationship values,
cases whose expected allow outcome depends on those values are `inconclusive`,
not an inferred pass.

| Case | Subject and target | Expected result before target approval | Required evidence |
| --- | --- | --- | --- |
| R-01 | Active approved AJ/CSC candidate → `package-instance-a` | `inconclusive` until named resource, relationship, and row are approved | Trusted subject/target resolution, capability/action, reason, result |
| R-02 | Same candidate → `package-instance-b` | `deny` once R-01 is approved | Wrong-tenant and wrong-package denial; no cross-tenant existence leak |
| R-03 | Active CSC outside any pilot → tenant A resources | Existing baseline only; pilot-only result is `not_run` | Separation between current behavior and proposed pilot authority |
| R-04 | Client Admin/User → own tenant A instance/stage | `inconclusive` until TOM defines client learning visibility | Own-tenant result and absence of builder/enrolment administration |
| R-05 | Client Admin/User → tenant B instance/stage | `deny` | Wrong-tenant target and sanitized denial |
| R-06 | `unrelated-subject` → tenant A instance/stage | `deny` | No relationship inferred from assignment labels or matching names |
| R-07 | `disabled-subject` or expired/revoked subject → any target | `deny` | Direct boundary denial, including replay/cached request case |
| R-08 | Anonymous caller → instance/stage and related views | `deny` unless a field is separately classified as public metadata | ACL/policy result and no sensitive data returned |
| R-09 | Super Admin → approved target | `inconclusive` until hard-control scope is named | Explicit hard-control decision; Super Admin is not a substitute persona |
| R-10 | Machine/service principal → browser read target | `deny` | No human-role or browser impersonation reuse |

For each executed case, capture only redacted metadata: case ID, fixture hash,
trusted subject class, target class, first server boundary, result,
stable reason code, HTTP/RPC status, latency, and audit/correlation ID. Never
publish row content, tokens, prompts, or raw error details that reveal a
protected resource.

## Resource-specific checks

### Package instances

- Resolve the package instance's tenant inside the trusted boundary.
- Verify active, wrong-tenant, missing-target, disabled-subject, and replay
  outcomes independently.
- Keep catalogue package/stage metadata separate from tenant-owned instance
  access; a broad authenticated catalogue read is not instance authority.
- Exclude create/edit/close, assignment, export, and lifecycle writes from this
  read-only contract.

### Client stage instances

- Resolve the stage through its package instance and tenant, not a caller-only
  tenant selector.
- Verify own tenant, wrong package, wrong tenant, stale/disabled subject, and
  empty-stage outcomes.
- Record whether `node_state`, status, dates, and freshness are operational
  TOM data or Client Health evidence; do not assign that ownership implicitly.
- Exclude stage publish/apply, version administration, learner progress, and
  aggregate analytics; those are separate resource classes and gates.

## Run and cleanup contract

The future hosted run must be read-only unless a separately approved fixture
seed is named. Before it starts, the operator must have the target project,
QA-only identities, fixture/reset approval, run window, private artifact
owner/retention, and an explicit no-production guard. Missing personas or
ambiguous authorization results are `inconclusive`.

If a disposable fixture is later seeded under its own approval, cleanup must be
run-scoped and reverse-ordered: stage instances, package instances, mappings,
catalogue rows, subjects, then tenants. A cleanup failure is a failed run,
not permission to delete by broader predicates. The final artifact must
include residue counts for every relation.

## Approval and exit gates

This contract becomes executable only after:

1. TOM names the package/stage ownership and relationship semantics.
2. Product/security accepts or parks each resource class and action name.
3. The QA target, synthetic strata, personas, and private artifact owner are
   explicitly named.
4. The first trusted server boundary and denial reason contract are recorded.
5. Positive/negative cases, rollback, cleanup, and audit ownership are
   approved for the bounded run.

No row becomes `implementation_ready` from this fixture contract alone. A
future implementation packet must still prove direct authorization, parity
with the independently approved golden matrix, and zero unexplained
cross-tenant allows or lockouts.

## Verification

Documentation-only packet. Before review, run:

```text
node scripts/check-kb-links.mjs
node scripts/check-kb-doc-size.mjs
git diff --check
```

No frontend, Edge, database, credential, hosted-QA, or live mutation
verification is applicable because this change contains no runtime or
environment action.
