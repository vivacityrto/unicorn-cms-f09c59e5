# TOM P0.4 — QA negative cases and cleanup/runbook contract

> **Status:** preparation-only. This packet makes the existing [offline QA
> fixture manifest](p0-2-p0-3-offline-qa-fixture-manifest.md) executable as a
> future, separately authorized read-only QA plan. It does not create
> credentials, connect to Supabase, seed/reset hosted data, run browser
> storage states, change schema/RLS/RPC/grants/Realtime, or alter production.
>
> **Owners:** TOM owns tenant and relationship semantics; RBAC owns action,
> actor, scope, and denial interpretation; Client Health owns provenance,
> freshness, and health-data handling where those resources are consumed.

## 1. Why this packet exists

The existing fixture manifest defines tenant strata, personas, query families,
and safety invariants. The existing query-family contract defines representative
positive coverage. This packet supplies the missing negative-case matrix and a
repeatable cleanup/runbook contract so a later approved run cannot report a
page render or an empty response as proof of authorization, isolation, or
data quality.

The expected result in the tables below is a **target contract for review**,
not a claim about current behavior. If the observed result differs, preserve
the raw evidence privately, publish only redacted metadata, and classify the
case as `mismatch` or `inconclusive` pending the owning decision. Never loosen
the expected denial merely to make a test pass.

## 2. Required fixture anchors

Use only the generated, run-scoped labels already defined by the manifest:

| Anchor | Minimum safe shape | Why it is needed |
|---|---|---|
| `tenant-a` / `tenant-b` | Two separate synthetic tenants with same-named resources | Proves tenant isolation rather than name-based filtering |
| `client-admin-a` / `client-user-a` | Same tenant, different client seat boundaries | Separates ordinary client reads from administration |
| `csc` / `integrator` / `team-leader` | Named internal contexts only; no future role inference | Exercises TOM relationship and RBAC action interpretation |
| `super-admin` | Internal administrative read baseline | Tests explicit hard-control boundary, not blanket access |
| `disabled-staff` | Disabled or revoked synthetic principal | Proves stale-token and route/cache denial |
| `service-principal` | Non-browser identity with one named workflow | Prevents human-role reuse by automation |
| relationship rows | membership, contact, package, stage, assignment, conversation, participant, and message examples | Exercises tenant/resource relationship resolution |
| ghost/collision rows | membershipless, multi-tenant, malformed-email, existing-contact, pending-invite, identity-collision | Preserves the existing ghost-classifier oracle |

Every row requires `run_id`, `fixture_tag`, synthetic identifiers, tenant
context, expected lifecycle state, and a deletion/retention disposition. Never
copy a production UUID, name, email, note, storage state, or payload into a
fixture.

## 3. Cross-initiative negative-case matrix

Each case is a read-only probe unless the row explicitly says `not run`. The
server-side first boundary must be identified before interpreting a result.

| ID | Actor/context | Target and operation | Expected contract | Evidence to capture | Owner |
|---|---|---|---|---|---|
| N-01 | Client User A | List, search, count, and detail for tenant B | Deny or return no tenant-B rows; no metadata leak | Trusted actor, resolved tenant, request/status, row keys/count | TOM + RBAC |
| N-02 | Client Admin A | Same-named package, stage, contact, conversation, and message in tenant B | Deny/no-match; same-name must not bypass tenant scope | Target IDs and relationship proof, not names alone | TOM |
| N-03 | CSC outside any approved pilot scope | Pilot-only Academy/package/stage action | Deny or remain on explicitly retained current behavior; no v6 grant implied | Capability/action, pilot state, server result, audit/error | RBAC |
| N-04 | CSC assistant | Learner identity/progress, staff directory, export, publish/version, unrelated tenant | Deny all unapproved sensitive or administrative paths | Field-level response shape and denial reason | RBAC + security |
| N-05 | Integrator/team leader | Tenant portfolio and assignment reads | Allow only the approved internal-read scope; do not infer write/export/lifecycle authority | Tenant relationship resolution and action boundary | TOM + RBAC |
| N-06 | Client User/Admin A | Global catalogue versus tenant-owned package instance | Apply the approved distinction; do not treat catalogue visibility as instance access | Resource class, target scope, view/RPC boundary | TOM + product |
| N-07 | Disabled/expired/revoked principal | Cached route, direct table/view, RPC, Edge, search, and stale replay | Deny every sensitive path; no cached result accepted as authorization | Auth state, token age/revocation fixture, status, cache state | RBAC + security |
| N-08 | Anonymous | Sensitive table/view/RPC/Edge and Ask Viv retrieval | Deny; only separately approved public metadata may be returned | Auth mode, object, status/body shape, policy boundary | Security |
| N-09 | Service principal | Human-only route or unallowlisted resource | Deny; fixed workflow cannot impersonate a human seat | Principal type, workflow allowlist, target, result | RBAC |
| N-10 | Client Admin A | `tenant_members`, `tenant_users`, and `tenant_contacts` identity collision | Resolve according to the approved TOM crosswalk; do not duplicate/promote implicitly | Synthetic identity keys, relationship rows, no-write assertion | TOM |
| N-11 | Any approved read persona | Membershipless, pending-invite, malformed-email, and existing-contact ghost cases | Classifier returns the named disposition; no activation, invitation, or profile write | Classifier output, `writes_performed: 0`, empty write list | TOM |
| N-12 | Client Admin A | Tenant A contact/address/package/stage relation with missing child row | Return explicit empty/unknown state, not another tenant's child | Parent key, child count, missing-state rendering | TOM + Client Health |
| N-13 | Client Admin A | Conversation/participant/message where actor is tenant A but participant belongs to B | Deny or return no rows according to the approved conversation policy | Subject, conversation/participant relation, status, policy result | RBAC + Client Health |
| N-14 | Any client persona | `v_client_package_stages` and `v_academy_course_progress` wrong tenant or unrelated learner | No cross-tenant/learner rows; view invocation must honor invoker policies | View, subject, target relationship, fields returned | RBAC + Client Health |
| N-15 | Client persona | Staff-only aggregate or stage-version RPC | Deny if not explicitly approved; aggregate permission is not learner-row permission | RPC name, caller, result, error/audit, server guard | RBAC + security |
| N-16 | Any persona | Direct write, migration, grant, activation, export mutation, or outbound email | `not run` in this packet; requires a distinct approved implementation packet | Record skip reason and authorization reference | All owners |
| N-17 | Any persona | Realtime subscription for tenant A, then same-named tenant B changes | `not run` unless Realtime test and fixture are separately approved; absence of publication is not success | Publication/listener metadata and event scope | TOM + engineering |
| N-18 | Any health consumer | Empty/stale/failing forecast source or missing operational evidence | Surface `unknown`/unavailable with reason; never stable/healthy by default | Source state, freshness, coverage, consumer output | Client Health |

For N-01 through N-15 and N-18, a successful HTTP response is not sufficient:
the result must include the trusted subject, resolved target, first server
boundary, expected policy version if known, returned row/field summary, and
redacted error/audit metadata. A response that cannot be tied to those facts is
`inconclusive`.

## 4. Result vocabulary and evidence record

Use one result per case/persona/stratum repetition:

```json
{
  "run_id": "tom-p0-2-p0-3-<generated>",
  "case_id": "N-01",
  "persona": "client-user-a",
  "fixture_stratum": "cross-tenant-a-b",
  "actor": { "synthetic_id": "qa-<run-scoped>", "auth_state": "authenticated" },
  "target": { "synthetic_id": "qa-<run-scoped>", "tenant": "tenant-b", "resource": "tenant_detail" },
  "first_server_boundary": "unknown-until-inspected",
  "expected": "deny_or_empty",
  "observed": "not_run",
  "classification": "inconclusive",
  "evidence": { "request_ref": "private-bundle-only", "status": null, "row_count": null },
  "reason": "Hosted identity and execution approval not present",
  "writes_performed": 0
}
```

Allowed `classification` values are `pass`, `mismatch`, `inconclusive`, and
`not_run`. Use `pass` only when the expected contract, trusted actor/target,
and server boundary are all evidenced. Use `mismatch` for a contrary result
that has sufficient evidence. Use `inconclusive` for missing credentials,
missing server evidence, ambiguous policy, failed harness, or incomplete
fixture. Use `not_run` for intentionally excluded writes, Realtime, or other
separately gated work.

The published summary may contain only case IDs, redacted persona labels,
classification counts, manifest hash, timings, and a pointer to a private
artifact bundle. Do not commit raw request payloads, response bodies, notes,
emails, storage state, tokens, or identifiable examples.

## 5. Read-only execution runbook

This is a future-run procedure, not authorization to execute it.

### 5.1 Preflight — stop if any item is missing

1. Confirm the target is the allowlisted non-production `unicorn-qa` project
   and record the manifest hash and source commit.
2. Obtain the named Carl/environment, security, TOM, RBAC, and Client Health
   owners for this run; record the observation window and private artifact
   owner/retention.
3. Confirm short-lived QA-only identities and storage states, or mark the
   unavailable persona `inconclusive`. Never substitute Super Admin for a
   missing client or disabled persona.
4. Confirm fixture strata, run ID/tag, reset method, and no concurrent writer,
   migration, activation, invitation, or worker touching the fixture.
5. Verify no production URL/UUID/row, service key, browser credential, or raw
   client material is present in the run bundle.
6. Confirm the case list and any direct RPC/Edge/Realtime probes have a named
   approval. Unapproved writes remain `not_run`.

### 5.2 Capture — preserve an auditable read-only result

1. Validate the generated fixture labels and expected relationships before the
   first request.
2. Warm up once, then run the manifest's three measured repetitions per
   persona/stratum. Keep actor/target assignments deterministic.
3. Capture redacted request method/status/duration, page errors, loading and
   settled states, row counts, payload sizes, and request waterfall.
4. For every negative case, capture the trusted subject, target resolution,
   first server boundary, policy/error outcome, and whether any stale or cached
   result was visible.
5. Stop immediately on any unexpected write, cross-tenant row, credential
   exposure, outbound email, or production-target signal. Preserve private
   evidence and classify the run as failed/inconclusive; do not “clean up” by
   issuing an unapproved compensating mutation.

### 5.3 Cleanup — reverse order and failure-visible

Only an explicitly authorized QA operator may perform this section. Cleanup
must use the run ID/tag, never a broad table-wide predicate:

1. Stop reads and close browser/session state.
2. Record the final run ledger, including attempted and skipped cases.
3. Remove only run-scoped child rows in reverse dependency order: transient
   messages/participants and Ask Viv turns, audit/event rows, stage/package
   children, contacts/memberships, identities, then synthetic tenants.
4. Revoke or expire any short-lived QA identity through the approved operator
   process; never commit or print its credential.
5. Re-run scoped residue queries for every fixture relation and assert zero
   rows for the run ID/tag. If a relation cannot be checked, classify cleanup
   as `inconclusive`, retain the private evidence, and stop.
6. Confirm no queued worker, invitation, activation, email, Realtime event,
   storage object, or private artifact still references the run tag.
7. Retain only the approved redacted summary and private bundle under the
   recorded retention policy. Do not delete audit evidence merely to make the
   residue check green.

The cleanup result must record `attempted`, `deleted_or_expired`, `residual`,
`unverified`, operator, timestamp, and artifact reference. A nonzero residual
or unverified relation is a failed cleanup gate, not a reason to broaden the
delete predicate.

## 6. Exit and escalation rules

The run may be summarized only when:

- all approved cases have a trusted actor/target and a first server boundary;
- all missing or unexercised cases are explicitly `inconclusive` or `not_run`;
- no unexpected write, cross-tenant allow, credential exposure, or outbound
  action occurred;
- the cleanup ledger and residue verification are complete; and
- TOM, RBAC, Client Health, security, and the named operator have reviewed the
  result relevant to their ownership.

Escalate rather than repair in this packet when a result reveals a security,
schema, RLS/RPC/Edge, Realtime, identity, performance, or data-quality defect.
The follow-up packet must name the exact object, owner, positive and negative
oracle, rollback, audit entry, and separate implementation authorization.

## 7. Current disposition

This document closes the preparation gap for negative cases and cleanup
procedure design. It does not close the TOM hosted-QA gate. The remaining
requirements are the approved target/operator/window, QA-only identities or
explicit unavailable-persona dispositions, fixture/reset approval, private
artifact ownership/retention, and cross-initiative review of policy outcomes.

The Client Health consultant operational-data dependency is independent and
remains open; repository or QA behavior cannot supply consultant cadence,
ownership, intervention, quiet-period, or pilot-usefulness decisions.

## Verification

Documentation-only packet. Before review, run:

```text
node scripts/check-kb-links.mjs
node scripts/check-kb-doc-size.mjs
git diff --check
```

No frontend, Edge, database, authorization, credential, hosted-QA, or live
mutation verification is applicable to this preparation document.
