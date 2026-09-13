# TOM P0.2/P0.3 — disposable verification and browser/query baseline packet

> **Last updated:** 2026-09-13 · **Status:** expanded bounded read-only characterization completed for nine browser personas plus a separate service-principal read contract; QA single-row fixture and production metadata cutoff recorded; broader query/cardinality and cross-initiative review gates remain open
> **Owner:** Tenant Operating Model, with RBAC, Client Health, and security review
> **Parent plan:** [Tenant Operating Model data architecture plan](../../tenant-operating-model-data-architecture-plan-2026-09-02.md)
> **Related evidence:** [P0.1 owner-disposition register](p0-1-owner-disposition-register.md); [ghost-to-contact evidence packet](../p1/p1-2-a-ghost-contact-dry-run-evidence-packet.md); [guarded ghost dry-run execution packet](../p1/p1-2-b-ghost-contact-dry-run-execution-packet.md)
> **Audit entry:** none needed — this remains the characterization plan; the separate [QA seed record](p0-2-qa-fixture-seed-record-2026-09-13.md) documents synthetic non-production provisioning

## Purpose and boundary

This packet joins the plan's P0.2 disposable-environment and P0.3
browser/query-baseline work into one reviewable evidence runbook. It defines
the fixtures, personas, read-only checks, measurements, artifacts, and exit
gates needed before any new directory view, RPC, contract, migration, RLS
change, or contact-promotion implementation is considered.

This packet did **not** create or reset a Supabase project, issue a credential,
run a live observation query, change production state, or select a numeric
performance budget. A separate QA-only seed record documents limited synthetic
fixture provisioning. Missing credentials, missing browser storage state, or
an unexercised persona is `Inconclusive`, never `Pass`.

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
| Target | Confirm `unicorn-qa` project ref/URL and that it is not production | Carl / environment owner | Complete — `qfpxvumcrnzrjyvqkicq`, production target false |
| Baseline | Version the production metadata capture and declare its migration cutoff | TOM / data owner | Complete — [2026-09-13 production catalog capture](data/p0-2-p0-3-production-metadata-capture-2026-09-13.json), cutoff `20260911094544` at `origin/main@29224ccb` |
| Fixtures | Approve synthetic fixture manifest, reset/retention method, and tenant IDs | TOM + security | Complete for bounded runs — run tag `tom_qa_20260913_seed_01`; canonical QA `app_settings` row with side-effect flags disabled verified in final run `34751973789`; cleanup remains separately gated |
| Personas | Provide QA-only credentials/storage states for every required persona, or mark that persona `Inconclusive` | Carl / security | Complete for this bounded run — anonymous plus nine browser-authenticated personas exercised; service principal passed its separate non-browser read contract |
| Operator | Name the operator and observation window | Carl | Complete — Codex automated run, 2026-09-13 06:07–06:14 UTC within the approved 60-minute window |
| Artifact | Name private artifact location, access list, and retention | Operations | Complete — private GitHub Actions artifact `tom-p0-characterization-34742103123`, Carl/repository maintainers, 30 days |
| Query safety | Confirm `EXPLAIN (ANALYZE, BUFFERS)` runs only on QA and that no production `ANALYZE` workload is included | TOM / DBA | Complete for this pass — plans executed only against allowlisted `unicorn-qa`; no production SQL or benchmark workload |
| Cross-initiative review | RBAC reviews authorization outcomes; Client Health reviews provenance/freshness implications | RBAC + Client Health | Open |

No additional hosted run may begin while any target, credential, fixture, or
artifact gate is open. A local test or static review may proceed without those
gates.

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

## Expanded P0.2 read-only characterization run

GitHub Actions run [`34742103123`](https://github.com/vivacityrto/unicorn-cms-f09c59e5/actions/runs/34742103123)
completed successfully on 2026-09-13. It ran 52 executions across seven
projects, using one warm-up repetition followed by three measured repetitions:
`48 passed, 4 skipped` (the CSC client-only check was
intentionally skipped on each repetition), one worker, with no application
writes. Storage states were generated inside the runner and were not uploaded.
The only retained artifact is the redacted Vite runner log under the approved
private 30-day retention policy.

Observed current behavior:

- The persistent QA Super Admin reached `/dashboard` and a representative
  Super Admin-only route on all three measured repetitions; no page errors occurred.
- The persistent QA client reached `/client/home` on all three measured
  repetitions and was denied the Super Admin-only route without being
  redirected to login.
- An anonymous browser context was redirected from `/client/home` to `/login`
  on all four repetitions without exposing protected content or page errors.
- Client Admin A, Client User A, and Client Admin B reached `/client/home` and
  `/client/packages` successfully on all three measured repetitions.
- All three client fixture rows carry `relationship_role=user`, so the
  current `/client/users` route gate redirected to `/client/home`. This is an
  observed compatibility boundary: the legacy `Admin`/`Client Parent` labels
  do not independently grant user-management access.
- CSC reached `/manage-tenants` and completed the safe search round-trip on all
  three measured repetitions; its client-only check remained intentionally
  skipped.
- Integrator and Team Leader reached the current staff shell; disabled staff
  reached the expected `Account Disabled` state; and the service principal
  passed its explicit non-browser `tenants` read contract. These are current
  behavior observations only, not future RBAC recommendations.

This is an expanded bounded characterization, not the complete P0.2/P0.3
baseline. The route timing lines are retained in the private Actions log for
the three measured repetitions. A follow-up instrumentation run is recorded
below; RBAC/Client Health/TOM review remains open.

Aggregate measured route timings from the redacted Actions log were stable
enough to characterize the current QA fixture without setting a product
budget: client-home medians were 1.11–1.60 s, client-package medians were
1.09–1.62 s, the relationship-role `/client/users` redirect medians were
0.93–0.94 s, and CSC `/manage-tenants` medians were 1.60 s. These are
environment-specific observations, not acceptance thresholds.

### Follow-up request-waterfall evidence

The protected follow-up run
[`34749153450`](https://github.com/vivacityrto/unicorn-cms-f09c59e5/actions/runs/34749153450)
used the same allowlisted QA fixture and seven-project scope after adding the
QA-only redacted waterfall observer. Its private artifact
`tom-p0-characterization-34749153450` is retained for 30 days, through
2026-10-13. Across 60 exercised route snapshots it recorded 1,686 Supabase
requests: 1,628 responses with status 200, one 401 response on
`/rest/v1/tenant_users`, and sixteen 406 responses on `/rest/v1/app_settings`.
There were zero request-failure events. The remaining 41 records were
explicitly marked in-flight at the one-second bounded post-assertion capture
window, predominantly from background auth/read polling; they are not
claimed as completed responses.

The run still completed with 48 passed and four intentional client-only
skips. The non-200 responses are retained as current-behavior evidence for
RBAC/TOM/owner interpretation; this packet does not infer a policy change or
attempt a repair from them. The observer records method, redacted pathname,
status, duration, and request/response byte metadata only; it does not retain
query strings, payloads, identifiers, credentials, or browser storage state.

### Evidence-based narrowing of the non-200 responses

The follow-up artifact deliberately omits request headers, query strings, and
response bodies, so it cannot identify an individual React caller from a
pathname alone. A read-only query against the same allowlisted `unicorn-qa`
project on 2026-09-13 nevertheless confirmed that `public.app_settings` had
zero rows at the time of review (`count(*) = 0`). This narrows, but does not
close, the sixteen `406` observations: the repository has several
`.single()` readers of this single-row table, while its `.maybeSingle()` and
collection readers return an empty result successfully. PostgREST's singular
representation rejects a zero-row result with `406`, which is consistent with
the observed empty QA fixture and the later `200` empty-array responses. The
exact four callers per route remain unassigned because the redacted artifact
does not contain query parameters or component timing identifiers.

The one `401` on `/rest/v1/tenant_users` occurred during the first
`qa-superadmin /dashboard` snapshot; subsequent requests to the same resource
on that route completed with `200`, and the route's authenticated assertions
passed. The source-side guards make an auth-bootstrap race plausible: the
client tenant context waits for the loaded profile and resolved tenant before
its tenant-user lookup, while global route boot also performs asynchronous
session/profile work. However, the metadata-only artifact cannot prove whether
the first request lacked a settled bearer session or was rejected for another
authorization reason. It must therefore remain an owner-reviewed
`Inconclusive`, not be silently relabeled expected.

The remaining owner actions are bounded: TOM/security should decide whether
the four client-route `406` observations are the expected result of the
approved `app_settings` RLS boundary, and should accept the absence of a
repeatable `tenant_users` `401` in the follow-up run. No production policy or
application behavior is changed by this interpretation.

#### Post-seed verification

After the single default-valued row was inserted and its side-effect flags
were disabled in `unicorn-qa`, the protected characterization was rerun from
`main` in
[`34751973789`](https://github.com/vivacityrto/unicorn-cms-f09c59e5/actions/runs/34751973789).
The run covered the same 60 route snapshots and recorded 1,701 Supabase
requests: 1,673 responses with status `200`, no `401` responses, four `406`
responses, 24 in-flight records at the bounded capture window, and zero
request-failure events. All four `406` responses occurred only for the
intentional client navigation to `/admin/user-audit`.

The QA catalog confirms the `app_settings` SELECT policy is restricted to
`is_super_admin_safe(...) OR is_vivacity_team_safe(...)`. Therefore a client
persona receives no visible row on that denied route, and a singular
`.single()` reader surfaces `406`; this is the expected authorization-negative
oracle, not a fixture failure. The prior `tenant_users` `401` did not recur,
so the earlier auth-bootstrap hypothesis is not promoted to a defect. The
remaining non-200 evidence is now bounded to this expected client denial and
requires no application change; the production baseline and owner-review
gates remain independent.

#### Expanded staff read-surface verification

The corrected protected run
[`34755463485`](https://github.com/vivacityrto/unicorn-cms-f09c59e5/actions/runs/34755463485)
ran from `origin/main@d907e4c2` with the staff-only tenant-detail,
integrations, and Ask Viv navigation checks repeated four times. It completed
with `84 passed, 16 skipped`, with no failures or flakes. Staff personas
reached the first tenant detail read model and the integrations page. The
`/ask-viv` route was also reachable, while its current rollout gate rendered
the deliberate unavailable state for these personas rather than the assistant
composer; the test records either current read-surface outcome and performs
no assistant generation or write. The run remains bounded navigation and
waterfall evidence, not complete export, Realtime, RPC, Edge, or AI query
family coverage.

## QA-only query-plan evidence

The exact current client query families were inspected before planning. On the
allowlisted QA project only, `EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON)` recorded:

| Query family | Fixture result | Planning | Execution | Shared blocks |
| --- | --- | ---: | ---: | ---: |
| `get_client_package_dashboard` list RPC for the representative tenant | 2 rows | 0.037 ms | 14.258 ms | 2,417 hit / 0 read |
| `get_client_package_dashboard` single-package RPC | 1 row | 0.038 ms | 14.122 ms | 2,389 hit / 0 read |
| `v_client_package_stages` ordered package-stage read | 6 rows | 1.217 ms | 0.394 ms | 39 hit / 0 read |

The dashboard RPC was evaluated with the QA client claim and its own-tenant
call returned rows; the same claim received zero rows for the cross-tenant
dashboard call. The SQL-console role bypasses browser RLS when explaining a
view directly, so the stage plan is evidence of query shape and cost only;
browser authorization outcomes remain the authoritative negative-case oracle.

### Versioned production metadata cutoff

The read-only production catalog capture for this packet is recorded in
[`p0-2-p0-3-production-metadata-capture-2026-09-13.json`](data/p0-2-p0-3-production-metadata-capture-2026-09-13.json).
It was taken against production project `yxkgdalkbrriasiyyrwk` on
2026-09-13, with repository context `origin/main@29224ccb`, and establishes
`20260911094544` as the migration cutoff for this evidence round. The
application-scope capture observed 651 tables, 136 views, 672 functions, 486
triggers, 1,956 policies, 2 publications, and 20 cron schedules; it read
catalog metadata only and no application rows. The cron count is source-state
evidence, not a QA value to copy. QA remains on its controlled 76-migration,
zero-cron ledger pending a separately reviewed forward-sync packet.

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
| Extend persona query-family coverage | TOM + RBAC + Client Health | Baseline and approved read-only query-family matrix |
| Interpret broad staff visibility | RBAC + TOM | Compare observed behavior with ADR-030 and the capability worksheet; no silent policy change |
| Decide directory contract and numeric budgets | TOM/product | Baseline reviewed across representative strata |
| Decide ghost promotion/retirement implementation | TOM/RBAC/operations | Separate QA evidence, caller/job/log closure, and explicit implementation packet |
| Any schema/RLS/grant/Realtime/Edge/data change | Named implementation owner | Separate authorization, verification, and audit entry |

**Conclusion:** the packet now contains an expanded bounded P0.2/P0.3
characterization for nine browser-authenticated personas, with four
intentional client-only skips, plus a separate non-browser service-principal
read contract. The versioned production metadata capture establishes the
`20260911094544` migration cutoff. The follow-up runs add a private redacted
request-waterfall baseline for the exercised routes, and the latest staff
read-surface run records `84 passed, 16 skipped` with no failures or flakes.
The post-seed run
confirms the remaining `406` responses are an expected client
authorization-negative case while the prior `401` did not recur. It is not
the complete baseline: full-cardinality/query-family coverage and
RBAC/Client Health/TOM owner review remain open. No implementation or
production change is implied.
