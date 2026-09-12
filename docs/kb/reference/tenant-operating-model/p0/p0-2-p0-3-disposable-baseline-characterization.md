# TOM P0.2/P0.3 — disposable verification and browser/query baseline packet

> **Last updated:** 2026-09-12 · **Status:** planning packet; no QA execution approval granted
> **Owner:** Tenant Operating Model, with RBAC, Client Health, and security review
> **Parent plan:** [Tenant Operating Model data architecture plan](../../tenant-operating-model-data-architecture-plan-2026-09-02.md)
> **Related evidence:** [P0.1 owner-disposition register](p0-1-owner-disposition-register.md); [ghost-to-contact evidence packet](../p1/p1-2-a-ghost-contact-dry-run-evidence-packet.md); [guarded ghost dry-run execution packet](../p1/p1-2-b-ghost-contact-dry-run-execution-packet.md)
> **Audit entry:** none needed — planning only; no hosted query, fixture write, schema, permission, migration, or production change

## Purpose and boundary

This packet joins the plan's P0.2 disposable-environment and P0.3
browser/query-baseline work into one reviewable evidence runbook. It defines
the fixtures, personas, read-only checks, measurements, artifacts, and exit
gates needed before any new directory view, RPC, contract, migration, RLS
change, or contact-promotion implementation is considered.

It does **not** create or reset a Supabase project, seed a fixture, issue a
credential, run a live query, change production or QA state, or select a
numeric performance budget. Missing credentials, missing fixture state, or an
unexercised persona is `Inconclusive`, never `Pass`.

## Current evidence and reusable components

The repository already supplies bounded pieces of the intended harness:

| Component | Current use | Boundary for this packet |
| --- | --- | --- |
| `unicorn-qa` | ADR-027 ratifies it as the shared disposable environment | QA target must still be confirmed for the specific run; production is never an implicit fallback |
| `scripts/validate-qa-baseline.mjs` | Fails closed on a production target, uncontrolled sync, cron, or incomplete manifest | Validate the manifest before any hosted sync or fixture step |
| `scripts/qa-baseline-parity.mjs` | Compares a read-only metadata capture with the approved baseline | Metadata parity is not row-fixture parity and cannot replace persona tests |
| `scripts/qa-baseline-capture.sql` | Catalog-only schema/security fingerprint query | Run only against the approved QA target after credential and operator gates are filled |
| `scripts/ghost-contact-dry-run.mjs` | Read-only ghost classification with an explicit QA URL guard and redacted output | Use synthetic in-memory cases for characterization first; a hosted snapshot remains separately gated |
| `scripts/ghost-contact-dry-run.test.mjs` | Covers normalization, candidates, multi-tenant rows, quarantine, contact/invite holds, and collisions | This is the logic oracle; it does not prove Supabase query or RLS behavior |
| `playwright.qa.config.ts` | Separate QA-only Playwright projects for Super Admin and client personas | Add a bounded directory/baseline spec only after approved QA storage states exist |
| `e2e/personas/operations.spec.ts` | Existing read-only `/manage-tenants` navigation and safe-search characterization | Reuse its no-write posture; add network/timing assertions in the QA packet, not production config |

The P0.1 inventory remains the source for current fields, filters, writers,
views, RPCs, Realtime claims, and security boundaries. P0.2/P0.3 must measure
that current behavior rather than quietly define a replacement contract.

## Required gates before QA execution

| Gate | Required evidence | Owner | Current state |
| --- | --- | --- | --- |
| Target | Confirm `unicorn-qa` project ref/URL and that it is not production | Carl / environment owner | Open |
| Baseline | Version the production metadata capture and declare its migration cutoff | TOM / data owner | Open |
| Fixtures | Approve synthetic fixture manifest, reset/retention method, and tenant IDs | TOM + security | Open |
| Personas | Provide QA-only credentials/storage states for every required persona, or mark that persona `Inconclusive` | Carl / security | Open |
| Operator | Name the operator and observation window | Carl | Open |
| Artifact | Name private artifact location, access list, and retention | Operations | Open |
| Query safety | Confirm `EXPLAIN (ANALYZE, BUFFERS)` runs only on QA and that no production `ANALYZE` workload is included | TOM / DBA | Open |
| Cross-initiative review | RBAC reviews authorization outcomes; Client Health reviews provenance/freshness implications | RBAC + Client Health | Open |

No hosted run may begin while any target, credential, fixture, or artifact
gate is open. A local test or static review may proceed without those gates.

## Synthetic fixture manifest

The fixture set must be deterministic, namespaced, disposable, and free of
real client names, emails, documents, or secrets. Every generated identifier
must be recorded in a private run manifest, never committed to the repository.

### Tenant and lifecycle strata

Create at least one tenant in each stratum, with a separate cross-tenant pair:

| Stratum | Required purpose | Minimum assertions |
| --- | --- | --- |
| Small | Empty/near-empty tenant and first-viewport behavior | List, count, detail, no-child-row handling |
| Median | Representative package/contact/member fan-out | Search, filters, assignments, package and contact joins |
| Skewed | One tenant with high child-row cardinality | Pagination, counts, payload size, no accidental whole-table transfer |
| Archived | Non-active lifecycle behavior | Inclusion/exclusion and exact filter semantics |
| Suspended | Access-restricted lifecycle behavior | Staff visibility versus client denial |
| Disabled | Disabled tenant/user edge behavior | No false active status or accidental access |
| Cross-tenant A/B | Same named resources in separate tenants | Client A cannot read, search, export, subscribe, or ask about B |

Seed only the minimum rows needed to exercise the P0.1 source matrix:
tenants, users, `tenant_users`, `tenant_members`, contacts, packages,
assignments, notes, integrations, invitations, and any exact Ask Viv source
fixture. Do not copy production rows or use production UUIDs.

### Persona matrix

| Persona | Tenant context | Required read-only coverage |
| --- | --- | --- |
| Anonymous | None | Login/route denial and no data disclosure |
| Client Admin A | Tenant A | Own-tenant list/count/detail/search/export/RPC/realtime behavior |
| Client User A | Tenant A | Same-tenant allowed subset and denied admin actions |
| Client Admin B | Tenant B | Cross-tenant separation from A |
| CSC | Staff context | Approved internal read scope and tenant relationship behavior |
| Integrator / Team Leader | Staff context | Current role-specific visibility; do not infer future RBAC policy |
| Super Admin | Staff context | Broad current read behavior and protected controls |
| Disabled staff | Disabled identity | Authentication/route/data denial behavior |
| Service principal | Non-browser QA identity | Only explicitly approved read-only contract calls; no browser-key substitution |

The matrix is a characterization of current behavior. It is not a role-default
or authorization recommendation. Any unexpected broad or narrow result gets a
reproducible evidence row and an owner; it is not “fixed” by changing a policy
inside this packet.

## P0.2 read-only characterization run

For each persona with valid QA credentials, run the same frozen fixture snapshot
and record request, response, authorization, and provenance evidence for:

1. directory list, counts, search, lifecycle filters, assignments, packages,
   contacts, notes, and integrations;
2. tenant detail, safe export/read-only download behavior, and empty/null
   child relations;
3. current Realtime listeners and the actual publication/row visibility result;
4. RPC and Edge calls used by the directory or tenant detail path;
5. structured Ask Viv tenant context and corpus retrieval, including tenant A
   versus tenant B denial; and
6. ghost-to-contact classification as a pure local oracle over synthetic rows,
   including membershipless, multi-tenant, malformed-email, existing-contact,
   pending-invite, and collision cases.

Record each case as `pass`, `fail`, or `inconclusive`, with:

- persona and fixture manifest hash;
- source commit and migration cutoff;
- route/API/RPC/Edge operation;
- expected current behavior and observed behavior;
- tenant/resource relationship proof;
- denial or cross-tenant negative result;
- request IDs or redacted trace references; and
- owner and next action for every fail or inconclusive case.

The ghost classifier's `writes_performed: 0` and empty `write_operations`
assertions are mandatory. Hosted ghost reads, if later approved, must follow
the separate P1.2-b packet and its six-relation read allowlist; this P0 packet
does not widen that authorization.

## P0.3 browser and network baseline

Use the QA-only Playwright config and a fresh authenticated context for each
persona. Capture, without mutating data:

- navigation response and page errors;
- time to directory skeleton, first visible row, and settled UI;
- every Supabase request URL/method, status, duration, and redacted payload
  size;
- request waterfall and concurrency by relation/operation;
- transferred and decoded bytes;
- list, search, filter, count, detail, and safe-export request counts; and
- visible empty/error/denied states for the synthetic strata.

Run at least three repetitions per persona/stratum after one warm-up, retain
raw traces privately, and publish only aggregate timings and redacted request
metadata. Do not set budgets from one run. The first result is a baseline;
the budget remains `pending` until TOM, security, and the relevant initiative
owners review variance and fixture representativeness.

The browser baseline must distinguish application work from environment noise:
record browser version, viewport, network mode, QA project region, cold/warm
state, fixture hash, and commit. A failed login, missing storage state, or
route redirect is a harness failure/inconclusive result, not a performance
measurement.

## Query and metadata baseline

After the browser run identifies the actual current operations, capture the
corresponding query families in QA only:

1. list and first-page tenant ID selection;
2. search and lifecycle/assignment/package filters;
3. counts and child joins;
4. tenant detail and contact/member/package relations;
5. export/read-only download path;
6. Realtime publication/listener path; and
7. current RPC/Edge/Ask Viv structured and retrieval reads.

For each query family record the exact normalized query, parameters shape,
plan summary, planning/execution time, shared-hit/read counts, returned rows,
and fixture cardinality. `EXPLAIN (ANALYZE, BUFFERS)` is permitted only on the
isolated QA fixture. Production evidence is limited to read-only catalog,
relation-size, index-usage, lock, bloat, and approved `pg_stat_statements`
observations; never run a production `ANALYZE` or benchmark workload here.

The QA metadata capture must pass the existing baseline validators before it
is compared. Schema parity is necessary but not sufficient: row fixtures,
persona outcomes, and query plans must all be present for a `pass`.

## Artifact and rollback rules

The run produces a private bundle containing the fixture manifest hash,
redacted persona labels, aggregate results, query-plan summaries, and links to
retained traces. It must not contain service keys, browser storage state,
unredacted emails, names, UUIDs, or production rows. If a credential or
identifier leaks, stop, revoke/rotate the affected QA credential, and delete
the artifact according to the approved retention procedure.

Because this packet is read-only, its rollback is “discard the fixture and
artifacts according to the approved QA retention procedure.” Any future seeded
fixture or hosted reset needs its own explicit runbook and approval; no
production rollback or data correction is implied.

## Exit criteria and decision ledger

P0.2/P0.3 are review-ready when:

- the QA target, baseline cutoff, fixture manifest, operator, and artifact
  retention are named;
- every required persona has a result, or an explicit `Inconclusive` owner and
  unblock condition;
- current directory, detail, export, Realtime, RPC/Edge, and Ask Viv behavior
  has a redacted evidence row;
- synthetic ghost classification passes its local oracle cases and remains
  clearly separate from any hosted ghost read;
- browser/network timings cover cold/warm repetitions and cardinality strata;
- QA query plans and metadata fingerprints are retained without production
  workload execution; and
- RBAC, Client Health, and TOM owners review cross-tenant, scope, freshness,
  and provenance findings.

The following remain explicitly outside this packet:

| Item | Owner | Unblock condition |
| --- | --- | --- |
| Approve QA target and credentials | Carl / security | Named QA project, short-lived read-only identity, private artifact location |
| Resolve missing persona fixtures | Carl / TOM | Synthetic fixture and storage-state manifest approved |
| Interpret broad staff visibility | RBAC + TOM | Compare observed behavior with ADR-030 and the capability worksheet; no silent policy change |
| Decide directory contract and numeric budgets | TOM/product | Baseline reviewed across representative strata |
| Decide ghost promotion/retirement implementation | TOM/RBAC/operations | Separate QA evidence, caller/job/log closure, and explicit implementation packet |
| Any schema/RLS/grant/Realtime/Edge/data change | Named implementation owner | Separate authorization, verification, and audit entry |

**Conclusion:** the packet makes P0.2/P0.3 executable in a disposable,
evidence-first way, but neither phase has executed. Until the open gates are
filled, their status remains planning-ready and execution-inconclusive.
