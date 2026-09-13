# Remaining gated approval packets — 2026-09-12

> **Status:** decision-ready review packet; preparation approvals are recorded through 2026-09-13; runtime and external-input gates remain explicit
> **Parent:** [cross-initiative approval-unblock matrix](approval-unblock-matrix-2026-09-12.md)
> **Current coordination view:** [unattended preparation authorization matrix](unattended-preparation-authorization-matrix-2026-09-13.md); [current blocker-resolution packet](blocker-resolution-packet-2026-09-13.md)
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
| R2-a | Decompose 18 bundled `manage`/`use` rows | Split list/read, create, edit, role/relationship, disable, invite, export, and external side effects into separate actions | Product + security | Atomic decomposition approved; P1-e delivered; exact golden rows and enforcement evidence remain gated | Source/boundary reconciliation; no grant or cutover |
| R2-b | `clients.details.edit` semantics | **Approved design direction:** one ordinary profile-edit action; no inferred `limited`/`full` distinction and no page-wide alias | Product | Design approved; implementation blocked on field/source and server-boundary evidence | [P1-f contract](../../rbac-v6/p1/p1-f-client-details-capability-semantics.md); no gate change |
| R2-c | `staff.internal` catalogue fate | **Approved design direction:** treat it as principal-state/identity context, not action authority; retire the action row after endpoint replacements are approved and migrated | Product + security | Design approved; implementation blocked on replacement gates and endpoint contracts | [P1-g consumer inventory](../../rbac-v6/p1/p1-g-staff-internal-consumer-inventory.md); no catalogue or gate change |
| R2-d | High-risk delegability | Keep the 11 high-risk rows non-delegable and approval-controlled by default | Security | Interim default approved; implementation/exception remains blocked on security control sign-off | [P1-h control worksheet](../../rbac-v6/p1/p1-h-high-risk-delegability-control-worksheet.md); no grant or gate change |
| R2-e | Job-role defaults and AJ/CSC pilot | Use reviewed seat boundaries; pilot only the smallest exact Academy/package/stage action set with named scope, personas, 14-day shadow, and rollback owner | Product/operations + Carl/Vivacity | QA-first cohort and minimum capability boundary accepted; role defaults and pilot enrollment remain blocked on named owners/gates | [P1-i worksheet](../../rbac-v6/p1/p1-i-job-role-defaults-aj-csc-pilot.md); no role/grant/pilot change |
| R2-f | AJ/CSC shadow and pilot evidence | Compare current and v6 decisions non-authoritatively for 14 days before any cutover | RBAC/security + product/operations | Evidence contract approved for preparation; telemetry implementation and pilot enrollment remain blocked on storage/retention/reviewer/cohort inputs | [P1-j shadow evidence](../../rbac-v6/p1/p1-j-aj-csc-shadow-evidence.md); no logger, grant, or pilot change |
| T1-x | Hosted TOM P0.2/P0.3 execution | Use the approved synthetic, read-only `unicorn-qa` run as the current-behavior baseline; repeat only if a named residual gate requires it | Carl + security/environment owner | Expanded bounded run completed 2026-09-13 in Actions run `34742523972`: anonymous plus six authenticated personas, 48 passed and 4 intentional client-only skips; baseline cutoff, full request-waterfall evidence, missing personas, and cross-initiative review remain open | Reconcile residual evidence and owner dispositions; no production or implementation change |
| T2 | TOM implementation | Keep directory/writer/membership/normalization/Realtime/RLS work deferred | Carl + product/data/security | Blocked by design | Contract comparison and evidence gap list |
| H2 | Forecast job disposition | Keep jobs stopped and outputs unavailable; retain legacy artifacts as evidence without repair or restart | Client Health/data owner + Carl | Owner disposition approved 2026-09-13; replacement-shadow authorization remains separately gated | If replacement is chosen later, prepare its data owner, synthetic fixture, run-ledger, and shadow/rollback contract |
| H3 | Consultant operational input | Obtain AJ/Ezel/consultant reports before thresholds, confidence, or pilot acceptance | Consultants + Carl | External blocker acknowledged 2026-09-13; reports remain outstanding | Report template and evidence schema |
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
| R2-b: `clients.details.edit` | Approved direction: one ordinary profile-edit action; no inferred `limited`/`full` distinction and no page-wide permission alias | Current `usePermission` ordinal semantics make both thresholds pass at the only observed call site; [P1-f](../../rbac-v6/p1/p1-f-client-details-capability-semantics.md) narrows the target boundary | No UI gate rewrite or role-matrix change |
| R2-c: `staff.internal` | Approved direction: principal-state context rather than an action capability; retire the action row after endpoint-specific replacements are approved and migrated | The plan warns against using identity visibility as broad authorization; [P1-g](../../rbac-v6/p1/p1-g-staff-internal-consumer-inventory.md) found six direct production Edge consumers and no frontend feature-key consumers | No removal of staff access, catalogue deletion, or replacement-gate change |
| R2-d: high-risk rows | Keep permission administration, system config, migration/testing, external credentials, tenant lifecycle, export, and bulk generation non-delegable by default | [P1-h](../../rbac-v6/p1/p1-h-high-risk-delegability-control-worksheet.md) defines the required target, approval, expiry/revocation, audit, and negative-case contract before any exception | No grant changes, new approvers, or break-glass path |
| R2-e: job-role defaults | Use the reviewed seat boundaries in [P1-i](../../rbac-v6/p1/p1-i-job-role-defaults-aj-csc-pilot.md); hold activation until atomic rows, representative seat owners, golden matrix, and negative fixtures are reviewed | Defaults turn catalogue rows into real privilege at scale; Team Leader/CET/Team Member migration must not widen access | No seat assignment or role bundle activation |
| R2-f: AJ/CSC pilot | Pilot only the smallest demonstrated Academy/package/stage action set, with named scope, personas, 14-day shadow, zero-tolerance mismatch gates, and rollback owner | [P1-j](../../rbac-v6/p1/p1-j-aj-csc-shadow-evidence.md) defines the dual-decision event, privacy, retention, mismatch, and review contract; pilot scope is still a product decision | No pilot enrollment, grant, route cutover, or production observation |

### Current preparation disposition — 2026-09-13

The current task discussion accepted the recommended preparation boundaries:

- R2-a's atomic decomposition rule is accepted for continued source and
  enforcement reconciliation; it is not a grant or cutover approval.
- R2-d's non-delegable default is accepted; security still owns any exception
  or protected workflow.
- R2-e/f's QA-first, one-to-two-tenant pilot shape and minimum initial read
  boundary are accepted for packet preparation; exact tenant/resource IDs,
  owners, retention, and security sign-off are still required before
  enrollment.
- P1-j's shadow-recording design is accepted for documentation and fixture
  preparation; its logger/storage/telemetry implementation remains separately
  gated.

These dispositions clear preparation work only. They do not authorize role
assignments, capability grants, hosted QA, pilot enrollment, telemetry
deployment, route cutover, schema/RLS/RPC/trigger changes, Edge deployment,
scheduled-job changes, or production/live-data action.

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
credentials or browser storage state. The approved bounded execution filled
the required target, fixture, operator, artifact, and query-safety fields for
the allowlisted `unicorn-qa` target. It completed in GitHub Actions run
`34742523972` on 2026-09-13 with anonymous plus six authenticated personas;
the result was 48 passed and 4 intentional client-only skips. Integrator,
Team Leader, disabled-staff, and service-principal cases remain explicitly
`Inconclusive`, not silently passed.

The residual fields for any follow-up run are:

| Preflight field | Required value | Owner | Stop if missing |
| --- | --- | --- | --- |
| Target | Confirm `unicorn-qa` project ref and URL are still allowlisted/non-production | Carl / environment owner | Yes |
| Read identity | Short-lived QA-only read identity for each required persona, or explicit `Inconclusive` disposition | Security | Yes |
| Fixture approval | Approve five strata, six personas, generated run IDs, reset/retention method | TOM | Yes |
| Operator/window | Named operator and observation window | Carl | Yes |
| Artifact | Private location, redaction owner, retention period | Operations | Yes |
| Test scope | Read-only directory/detail/search/filter/export-read/Realtime/RPC/Edge/Ask Viv checks | TOM + RBAC | Yes |
| Cleanup | Run-scoped reverse-order cleanup and residue verification | Operator | Yes |

The T1-x approval was used only for that one isolated, read-only run. Any
follow-up run needs its own named scope and must preserve the same boundary.
T1-x does not authorize production URLs, credential creation by this agent,
mutations, migrations, outbound email, hosted ghost promotion, or
schema/RLS/grant changes. A failed login, missing storage state, or missing
persona is `Inconclusive`, never `Pass`.

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

- **H2:** H0.3b/c source/live-schema comparison, caller/consumer inventory, and
  deployed-source reconciliation are complete. They found no cron/history/
  output activity and material source-schema mismatches, so the current
  recommendation is to retain the legacy jobs and keep them stopped without
  repair. Carl and the Client Health/data owner approved retaining them as
  evidence, keeping them stopped, and marking the consumer result unavailable.
  A replacement-shadow packet remains a separate future authorization and
  still needs a named data owner, synthetic fixtures, a versioned run ledger,
  and a shadow/rollback contract.
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
