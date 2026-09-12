# Remaining gated approval packets — 2026-09-12

> **Status:** decision-ready review packet; no approval is implied by this document
> **Parent:** [cross-initiative approval-unblock matrix](approval-unblock-matrix-2026-09-12.md)
> **Inputs:** [RBAC P1-d static ledger](../../rbac-v6/p1/p1-d-static-enforcement-ledger.md), [TOM offline QA manifest](../../tenant-operating-model/p0/p0-2-p0-3-offline-qa-fixture-manifest.md), [AdminStageDetail characterization](../phase-4/admin-stage-detail-characterization.md), [Client Health plan](../../client-health-activity-analytics-plan-2026-09-03.md)
> **Owner:** Carl, with product/security/data/environment owners named per gate
> **Scope:** turn the remaining genuine gates into explicit, reviewable asks so unattended preparation can stop exactly at the right boundary
> **Audit entry:** none needed — documentation-only planning; no production, schema, authorization, credential, deployment, hosted QA, or live data action

## How to use this packet

Each row has four separate states:

1. **Recommendation:** the safest default supported by current evidence;
2. **Approval scope:** what an explicit approval would allow;
3. **Required evidence:** what must exist before the next boundary; and
4. **Stop boundary:** what remains forbidden even after the preparation row is
   approved.

“Approve preparation” is not “approve implementation.” A missing credential,
product choice, security review, consultant report, or rollback owner remains a
hard stop. The status form at the end is intentionally explicit; silence or a
general “continue” must not be converted into a product/security decision.

## Gate summary

| ID | Decision / gate | Recommendation | Owner | Current status | Safe unattended work |
| --- | --- | --- | --- | --- | --- |
| R2-a | Decompose 18 bundled `manage`/`use` rows | Split list/read, create, edit, role/relationship, disable, invite, export, and external side effects into separate actions | Product + security | Blocked on row decisions | Source/caller decomposition and question drafting |
| R2-b | `clients.details.edit` semantics | Decide whether `limited`/`full` equivalence is intentional; default recommendation is one explicit edit action until product says otherwise | Product | Blocked on semantic choice | Preserve both possibilities in the ledger; no gate change |
| R2-c | `staff.internal` catalogue fate | Treat as principal-state/identity context, not broad action authority; recommend retiring it as an action capability if consumers confirm | Product + security | Blocked on catalogue decision | Consumer inventory and replacement mapping |
| R2-d | High-risk delegability | Keep the 11 high-risk rows non-delegable and approval-controlled by default | Security | Blocked on control semantics | Branch/target/audit evidence inventory |
| R2-e | Job-role defaults and AJ/CSC pilot | Defer until atomic rows, golden matrix, personas, and observation/rollback owner exist | Product/operations + Carl/Vivacity | Blocked by prerequisites | Fixture and evidence-plan preparation |
| T1-x | Hosted TOM P0.2/P0.3 execution | Approve one synthetic, read-only `unicorn-qa` run only after preflight fields are filled | Carl + security/environment owner | Blocked on credentials/operator/artifact | Offline manifest validation and runbook prep |
| T2 | TOM implementation | Keep directory/writer/membership/normalization/Realtime/RLS work deferred | Carl + product/data/security | Blocked by design | Contract comparison and evidence gap list |
| H2 | Forecast job disposition | Do not restart jobs; keep outputs unavailable until source/consumer/shadow evidence exists | Client Health/data owner + Carl | Blocked on evidence/owner | Consumer and source contract inventory |
| H3 | Consultant operational input | Obtain AJ/Ezel/consultant reports before thresholds, confidence, or pilot acceptance | Consultants + Carl | External blocker | Report template and evidence schema |
| A2 | AdminStageDetail extraction | Permit only pure display seams after owner review; behavior-bearing seams remain with TOM/RBAC/Client Health | Codebase + TOM/RBAC | Blocked on contract/oracle clearance | Finalize call graph and seam decision table |

## R2 — RBAC policy decision packet

The P1-d ledger is source-backed but intentionally not a golden access matrix.
It found 85 rows, 18 bundled verbs, 25 capability keys with concrete Edge
gate references, 34 rows with frontend gate references, and 29 rows with
neither a recognized frontend nor concrete Edge key reference. None of those
counts alone establishes the intended policy or proves the live RLS boundary.

### Exact decisions requested

| Ask | Recommended answer | Why | What approval does not authorize |
| --- | --- | --- | --- |
| R2-a: split bundled verbs | Approve atomic action decomposition as the target modelling rule; do not preserve `manage`/`use` as a single grant when sub-actions differ in risk | A single row currently bundles reads, writes, role changes, exports, and external effects | No role grant, default, route cutover, or RLS change |
| R2-b: `clients.details.edit` | Confirm whether `limited` and `full` being equivalent at `ClientDetail.tsx:263` is intentional. Recommended interim classification: unresolved, no new distinction inferred | Current `usePermission` ordinal semantics make both thresholds pass at the only observed call site | No UI gate rewrite or role-matrix change |
| R2-c: `staff.internal` | Confirm it is principal-state context rather than an action capability; recommended catalogue treatment: retire as an action row after consumer inventory | The plan warns against using identity visibility as broad authorization | No removal of staff access or replacement predicate |
| R2-d: high-risk rows | Keep permission administration, system config, migration/testing, external credentials, tenant lifecycle, export, and bulk generation non-delegable by default | Limits privilege creep while target resolution, expiry/revocation, audit, and negative cases are still incomplete | No grant changes, new approvers, or break-glass path |
| R2-e: job-role defaults | Hold until atomic rows, representative seat owners, golden matrix, and negative fixtures are reviewed | Defaults turn catalogue rows into real privilege at scale | No seat assignment or role bundle activation |
| R2-f: AJ/CSC pilot | Hold until cohort, tenant/resource relationship, observation window, rollback owner, and 14-day shadow criteria are named | Pilot scope is a product decision, not an inference from current role rows | No pilot enrollment or production observation |

### Acceptance and rollback

Acceptance requires product/security to sign off the atomic action names,
target/scope/relationship semantics, high-risk control model, and unresolved
rows. The evidence ledger is then versioned into a separately owned golden
matrix; only approved rows may progress to a bounded implementation packet.
Rollback for this preparation is reverting the documentation/ledger PR. Any
runtime authorization change requires its own migration/RLS/Edge verification,
negative probes, audit entry, and explicit implementation approval.

## T1-x — TOM hosted QA preflight packet

The [offline fixture manifest](../../tenant-operating-model/p0/p0-2-p0-3-offline-qa-fixture-manifest.md)
is complete and safe to carry forward, but it intentionally contains no
credentials or browser storage state. Before hosted execution, fill every row:

| Preflight field | Required value | Owner | Stop if missing |
| --- | --- | --- | --- |
| Target | Confirm `unicorn-qa` project ref and URL are still allowlisted/non-production | Carl / environment owner | Yes |
| Read identity | Short-lived QA-only read identity for each required persona, or explicit `Inconclusive` disposition | Security | Yes |
| Fixture approval | Approve five strata, six personas, generated run IDs, reset/retention method | TOM | Yes |
| Operator/window | Named operator and observation window | Carl | Yes |
| Artifact | Private location, redaction owner, retention period | Operations | Yes |
| Test scope | Read-only directory/detail/search/filter/export-read/Realtime/RPC/Edge/Ask Viv checks | TOM + RBAC | Yes |
| Cleanup | Run-scoped reverse-order cleanup and residue verification | Operator | Yes |

An explicit T1-x approval authorizes scheduling/executing that one isolated,
read-only run after all fields are filled. It does not authorize production
URLs, credential creation by this agent, mutations, migrations, outbound
email, hosted ghost promotion, or schema/RLS/grant changes. A failed login,
missing storage state, or missing persona is `Inconclusive`, never `Pass`.

## T2 — TOM implementation gate

No implementation approval is recommended yet. The directory contract,
canonical writer, membership migration, package normalization, Realtime
publication, RLS/grants, and schema cleanup all depend on the source/identity
and capability contracts. The next acceptable approval must name one exact
object or writer, its owner, canary fixture, negative case, rollback, and audit
entry. No unattended action should cross this boundary.

## H2/H3 — Client Health gates

The H1 semantic decision is recorded: empty, failed, stale, invalid, or
incomplete burn/retention inputs must surface as `unavailable`/unknown rather
than `normal`/`stable`. The remaining gates are different:

- **H2:** keep the legacy forecast jobs stopped/retired and do not repair,
  restart, or delete them until source/live-schema comparison, consumer
  inventory, data ownership, synthetic fixtures, a versioned run ledger, and a
  shadow/rollback contract exist.
- **H3:** obtain consultant operational reports covering cadence, blocker
  ownership, intervention patterns, quiet/data-insufficient examples, and
  pilot usefulness. Thresholds, confidence semantics, cohort selection, and
  pilot acceptance remain provisional without them.

The safe unattended work is documentation of the source/consumer contract and
report template. No forecast job, cron schedule, metric value, or production
consumer is changed by this packet.

## A2 — AdminStageDetail extraction gate

The shared characterization packet records the page's 11 direct Supabase call
sites, 14 delegated hook boundaries, route guard, direct Super Admin branch,
and the current absence of a page-level focused test suite. The next gate is
not “the file is large”; it is whether a seam has a cleared behavior contract
and a real oracle.

| Candidate class | Recommendation | Required oracle / review |
| --- | --- | --- |
| Pure props/display composition | Potentially Codebase-owned | Compiler proof that no state/query/mutation/auth/tenant resolution moved; parent owner review |
| Stage settings, identity aliases, package/replacement/recurrence | TOM + RBAC | Focused tests if a cheap seam exists; otherwise verbatim move plus authenticated QA workflow |
| Certification, audit, export/import, email | TOM + RBAC/security | Explicit business/security contract, failure ordering, negative cases, and safe QA fixture |
| Tasks/documents/commitments | TOM; Client Health only if a real reader is proven | Source-backed downstream consumer map and chosen oracle |

Until those conditions are met, do not extract behavior-bearing state, query,
mutation, audit, auth, or tenant-resolution code. The page's route guard and
current server-side boundaries must remain unchanged.

## Copyable owner status form

Use one explicit status per row; a general approval does not fill unrelated
rows:

```text
R2-a atomic bundled-verb rule: approve / hold
R2-b clients.details.edit semantics: approve recommended interim classification / choose alternate / hold
R2-c staff.internal catalogue fate: approve principal-state treatment / choose alternate / hold
R2-d high-risk non-delegability: approve / hold
R2-e job-role defaults: approve / hold
R2-f AJ/CSC pilot: approve / hold
T1-x hosted QA execution after preflight: approve / hold
T2 TOM implementation: approve exact object + owner + rollback, or hold
H2 forecast-job disposition: approve keep stopped / choose alternate / hold
H3 consultant input requirement: acknowledge blocker / provide reports / hold
A2 AdminStageDetail extraction: approve named pure seam + oracle, or hold
```

Until these are supplied, the unattended boundary is limited to the
documentation, source reconciliation, fixture preparation, and evidence
templates described above.
