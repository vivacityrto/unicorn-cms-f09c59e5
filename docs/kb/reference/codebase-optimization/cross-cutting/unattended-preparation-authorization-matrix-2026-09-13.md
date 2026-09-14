# Unattended preparation authorization matrix — 2026-09-13

> **Status:** decision-ready coordination packet; preparation boundaries are explicit, but no production or credential authority is implied
> **Inputs:** [Program Index](../../program-index.md), [preparation-to-implementation transition review](preparation-to-implementation-transition-review-2026-09-14.md), [current blocker-resolution packet](blocker-resolution-packet-2026-09-13.md), [remaining gated approval packets](remaining-gated-approval-packets-2026-09-12.md), [RBAC P1-i job-role/AJ pilot worksheet](../../rbac-v6/p1/p1-i-job-role-defaults-aj-csc-pilot.md), [RBAC P1-j shadow evidence contract](../../rbac-v6/p1/p1-j-aj-csc-shadow-evidence.md), [TOM P0.2/P0.3 offline QA manifest](../../tenant-operating-model/p0/p0-2-p0-3-offline-qa-fixture-manifest.md), [Client Health plan](../../client-health-activity-analytics-plan-2026-09-03.md)
> **Owner:** Carl, with named product/security/operations/environment owners per gate
> **Evidence cutoff:** `origin/main@da10cd274ff150586f827666b01cbfa5a1b4c3c6`
> **Audit entry:** none needed — documentation-only planning; no credential, hosted, schema, authorization, deployment, scheduled-job, or live-data action

## How to read this matrix

This matrix separates four states that have repeatedly been conflated:

1. **Settled policy:** a product/security meaning is already recorded and may
   guide preparation.
2. **Preparation authorized:** source review, synthetic fixtures, documentation,
   and implementation-packet work may proceed.
3. **External input required:** the next boundary needs a named owner, secret,
   environment, report, or product/security confirmation that cannot be safely
   inferred.
4. **Implementation separately gated:** no runtime, database, permission,
   deployment, job, pilot, or production action is authorized by preparation
   approval alone.

“Ready for unattended preparation” therefore means the work can continue to a
reviewable packet and stop at the named boundary. It does not mean that a broad
approval unlocks every downstream operation.

## Council truth-sync — 2026-09-14

The [preparation-to-implementation transition review](preparation-to-implementation-transition-review-2026-09-14.md)
examined the merged PR history and found that the major baseline preparation
is now delivered. Some runtime outcomes were shipped before their later packet
closeouts, including Client Health unavailable-state containment, client
identity/contact behavior, QA/evidence tooling, and the QA no-send invitation
mode. This matrix is therefore a stop-boundary document, not a request for
another generic preparation cycle.

Future work must identify the exact gate it closes. A packet refresh that adds
no new evidence, decision, or authorized implementation boundary should not be
opened. Historical snapshots below remain preserved; the newer transition
review and Program Index are the navigation sources for current disposition.

This matrix authorizes no permission change, role assignment, grant, schema
change, hosted run, deployment, scheduled-job change, pilot enrollment, or
production/live-data operation.

## Settled policy and completed preparation

| Initiative / gate | Current truth | Safe consequence |
| --- | --- | --- |
| Codebase Optimization Phase 4 | Slices 1–8 are the complete closed scope; no slice 9 is recommended after the joint exit re-audit | No further hotspot extraction is needed for this goal; future candidates route to the owning initiative or a joint matrix |
| RBAC/TOM staff scope | ADR-030: active internal staff retain broad cross-tenant read access; assignment is not silently a sensitive-write boundary | Use broad staff read as current policy; keep writes/actions explicit and scoped |
| RBAC atomic capability model | P1-b is a draft input; P1-e decomposes bundled verbs; the P1 ledgers and validators are delivered; `clients.details.edit` and `staff.internal` directions are recorded | Freeze generic row churn; use the existing ledger to assemble a named review slice; do not grant a broad `manage`/`use` row by inference |
| RBAC high-risk controls | P1-h recommends all 11 high-risk rows remain non-delegable and approval-controlled by default | No role/default/grant exception without security control review |
| RBAC seat boundaries | P1-i records CSC/assistant, Integrator, BGT, Team Leader, CET, Team Member, Super Admin, and machine-profile boundaries | Use these as review inputs; do not activate or migrate roles yet |
| AJ/CSC pilot shape | QA-first, then one or two named tenants; minimum initial reads are Academy builder, enrolment, package, and stage reads; writes require workflow proof | Prepare personas, capability rows, shadow report, and rollback packet |
| AJ/CSC shadow | P1-j defines current-vs-v6 dual decisions, privacy-safe events, 14-day observation, zero unexplained v6-only allows, and zero unexplained lockouts | Design and validate fixtures/reports; do not introduce telemetry or switch authority yet |
| TOM P0.2/P0.3 | Offline manifest, ghost classifier, seeded QA fixture, protected characterization, query-family checks, and waterfall evidence are delivered; residual persona/owner-review items remain | Do not repeat baseline preparation; resolve only the named residual coverage and cross-initiative review items |
| Client Health H1 | Consumer containment for empty, failed, stale, or invalid sources is shipped; values remain `unavailable`/unknown, not healthy/stable | Preserve the shipped behavior and stopped-job posture; do not invent scoring policy from missing consultant data |

## Unattended work that can proceed now

The following work is within the current preparation boundary:

- Keep the RBAC capability/action/scope/relationship matrix synchronized only
  when a named row review or cross-initiative decision changes it.
- Consume the existing synthetic fixtures, validators, and negative-case
  contracts in a specific packet; do not recreate the baseline inventory.
- Resolve the TOM contact-promotion contract and owner inputs for one bounded
  implementation packet; do not continue generic P0.1/P0.2/P0.3 refreshes.
- Preserve the shipped Client Health `unavailable` behavior and stopped-job
  posture while waiting for consultant evidence.
- Reconcile cross-initiative ownership only for a specific shared file or
  capability row, and open a documentation PR only when it closes a named gate.

## Remaining gates and conservative disposition

| Gate | Recommendation | What is still needed | Unattended stop boundary |
| --- | --- | --- | --- |
| RBAC golden matrix | Continue drafting only approved/clearly sourced rows; leave unknown rows unresolved | Product/security owner, atomic action semantics, relationship proof, and review record | No evaluator cutover, role default, grant, route change, or RLS change |
| R2-e job-role defaults | Keep P1-i seat boundaries as a proposed bundle model | Representative seat owners and golden-row review | No assignment, role rename, or role-registry mutation |
| R2-f AJ/CSC pilot | Use the agreed QA-first, one-to-two-tenant recommendation and minimum capability boundary | Named tenants/resources, pilot owner, rollback owner, security approval, and telemetry retention/access owner | No pilot enrollment, grant, production observation, or route cutover |
| Shadow telemetry | Use P1-j's private append-only event contract | Storage/sink choice, exact grants, tokenization custody, retention, reviewer list, writer failure behavior | No logger/table/telemetry deployment |
| T1-x hosted QA residual review | The approved synthetic `unicorn-qa` fixture and bounded protected/query-family runs are complete; residual persona coverage and cross-initiative owner review remain | Explicit disposition of inconclusive personas, address/Ask Viv coverage, and remaining owner review | No new credentialed run, fixture write/reset, or hosted query without a residual-scope approval |
| T2 TOM implementation | Do not approve a blanket implementation | One exact object/writer, source of truth, canary fixture, negative case, rollback, and audit entry | No schema, RLS, RPC, trigger, Realtime, normalization, or production change |
| H1 Client Health implementation | Consumer containment is delivered; metric policy and replacement work are not authorized by that containment | Consultant evidence, exact consumer/field, owner, synthetic proof, rollback, and audit requirement if data objects change | No runtime metric change, forecast restart, or production data change |
| H2 forecast jobs | Keep jobs stopped/retired and outputs unavailable; owner approved retain-as-evidence without repair/restart on 2026-09-13 | Replacement-shadow authorization only if a new path is desired; that path additionally needs a data owner, synthetic fixture, run ledger, and rollback contract | No cron/job restart, repair, deletion, or backfill |
| H3 consultant input | Treat operational reports as an external blocker | AJ/Ezel/consultant reports covering cadence, blockers, interventions, quiet/data-insufficient cases, and pilot usefulness | No threshold, confidence, cohort, or pilot acceptance decision inferred from missing reports |
| A2 AdminStageDetail | Keep behavior-bearing extraction deferred; only pure display work may be reconsidered | Joint TOM/RBAC/Client Health ownership and oracle clearance | No query/mutation/auth/tenant-state extraction |
| Parked RBAC items 14/15 | Leave system/person classification and tenantless-user assignment parked | Separate council/product decision and owner | No blanket classification, assignment, or cleanup |

## Proposed approval bundle for unattended preparation

The narrow approval that enables useful unattended progress is:

> Proceed with documentation, source reconciliation, synthetic fixture and
> negative-case design, golden-matrix drafting, and implementation-packet
> preparation for the gates above. Each task must use a dedicated branch from
> current `origin/main`, preserve the stated stop boundary, pass relevant
> verification, and open a reviewable PR. No credentials, hosted QA execution,
> permission/role/grant change, schema/RLS/RPC/trigger change, Edge deployment,
> scheduled-job change, pilot enrollment, or production/live-data action is
> included.

This bundle does not silently approve the external inputs. When a task reaches
one, it must stop and identify the exact missing owner/value rather than
substitute a broader credential, tenant, role, or environment.

## Completion evidence for this goal

The goal can be considered complete only when:

- this matrix and the authoritative initiative indexes agree on every gate;
- every actionable preparation item has either a merged packet/PR or an
  explicitly named blocker;
- all requested approvals are recorded at the correct scope;
- each implementation-ready packet has a named owner, oracle, negative case,
  rollback, and verification chain; and
- no prohibited runtime or production action has been taken.

Until then, the next best work is a named decision reconciliation or
packet-specific evidence gap. Do not invent another generic preparation item;
stop when the next boundary requires owner input, credentials, hosted data, or
implementation authorization.

## Verification

Documentation-only change. Run `node scripts/check-kb-links.mjs`,
`node scripts/check-kb-doc-size.mjs`, and `git diff --check`; no runtime suite
or hosted verification is applicable to this matrix.
