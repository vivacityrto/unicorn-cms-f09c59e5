# Cross-initiative approval-unblock matrix — 2026-09-12

> **Status:** decision-ready planning packet; R1, A1, T1, and H1 were explicitly approved in-session on 2026-09-12, with the execution prerequisites and remaining gates preserved below
> **Parent context:** [Program Index](../../program-index.md) and the four initiative plans
> **Inputs:** RBAC P1-c, TOM P0.2/P0.3, Client Health H0.3, and the `AdminStageDetail.tsx` joint ownership matrix
> **Follow-up gate packet:** [Remaining gated approval packets](remaining-gated-approval-packets-2026-09-12.md)
> **Owner:** Carl, with product/security/data owners named per row
> **Scope:** resolve gates needed to start the next unattended, non-production work goal
> **Audit entry:** none needed — documentation only; no live query, credential, permission, schema, deployment, or production change

## How to read this matrix

This separates three things that must not be conflated:

1. **Preparation authority:** permission to inventory, characterize, test with
   synthetic data, and write a reviewable packet.
2. **Product/security approval:** a choice about capability semantics,
   user-visible behavior, data interpretation, or pilot scope.
3. **Implementation authority:** permission to change code, database objects,
   authorization, scheduled jobs, deployments, or live data.

Approval of a preparation row never implies approval of implementation. A
missing credential, owner, or consultant report is `blocked`, not a pass.

## Decisions recorded — 2026-09-12

Carl explicitly approved the following rows in-session:

- **R1:** proceed with the RBAC P1 static/source evidence-ledger pass only;
  grants, role changes, RLS changes, Edge deployment, and route cutover remain
  out of scope.
- **A1:** proceed with the shared `AdminStageDetail.tsx`
  characterization and ownership/test-planning pass; do not extract behavior
  yet.
- **T1:** prepare the disposable, synthetic, read-only `unicorn-qa` run plan;
  execution remains blocked until the QA credential, operator, fixture, and
  artifact gates are satisfied.
- **H1:** use `unavailable`/unknown semantics for empty, failed, stale, or
  invalid Client Health sources; implementation remains separately gated and
  does not authorize a forecast-job restart or production change.

These approvals authorize preparation and packet work only. R2, T2, H2, H3,
and A2 remain blocked under their named owners and unblock conditions.

## Gate summary

| ID | Gate | Recommended disposition | Decision owner | Current state |
| --- | --- | --- | --- | --- |
| R1 | RBAC P1 evidence-ledger pass | Approve packet-level static/source reconciliation; keep grants, role defaults, and cutover out of scope | Carl + product/security | Approved in session; preparation only |
| R2 | RBAC capability semantics | Decompose bundled verbs; default high-risk actions to non-delegable pending explicit review; do not turn P1-b into policy | Product + security | Decision packet prepared; blocked on row decisions |
| T1 | TOM P0.2/P0.3 QA run | Approve one synthetic, read-only run in `unicorn-qa` | Carl + security/environment owner | Plan and preflight packet prepared; execution blocked on credential/operator/artifact gates |
| T2 | TOM P1 implementation | Keep schema/writer/directory/RLS work deferred until evidence and RBAC contracts are approved | Carl/product/data/security | Blocked by design |
| H1 | Client Health 54-tenant defaults | Prefer `unavailable`/unknown for empty, failed, or stale burn/retention sources | Carl + Client Health/product | Decision approved; implementation separately gated |
| H2 | Forecast job disposition | Keep jobs retired/marked unavailable; do not restart until source/consumer evidence and a shadow contract exist | Client Health/data owner + Carl | Blocked on owner/evidence |
| H3 | Consultant operational input | Obtain AJ/Ezel reports before H1 thresholds, confidence semantics, or pilot acceptance | AJ/Ezel/consultants + Carl | Blocked externally |
| A1 | `AdminStageDetail.tsx` characterization | Approve shared static/call-graph and test planning pass; no extraction yet | Codebase coordinator + RBAC/TOM | Approved in session; characterization only |
| A2 | `AdminStageDetail.tsx` extraction | Allow only pure policy-neutral display seams after A1; route behavior-bearing seams to owners | RBAC/TOM, Client Health if linked | Characterization packet prepared; extraction blocked on contract/oracle clearance |

## Decision-ready rows

### R1 — RBAC P1 evidence-ledger pass

**Recommendation:** approve the next static/source-only pass over all 85
features. It should decompose the 14 bundled `manage`/`use` features, reconcile
the 51 features without recognized frontend gates against routes, RPCs, Edge
Functions, and RLS, and attach a readiness state and owner to every row.

**What this approval allows:** repository grep/AST/source review, route and
caller inventories, synthetic negative-case design, and a versioned evidence
ledger. It does not allow permission grants, role changes, RLS changes, Edge
deployment, or route cutover.

**Acceptance:** every row has an action, target, actor, scope, relationship
proof, first enforcement boundary, denial case, owner, and readiness state;
ambiguous rows remain explicitly unresolved.

**Rollback:** revert the documentation/ledger PR; no runtime rollback exists
because no runtime state changes.

**Approval owner:** Carl for packet scope; product/security retain approval of
the actual capability semantics.

### R2 — RBAC capability semantics

This is the real policy gate, not a coding detail. The safe recommendation is:

- do not approve a broad `manage`/`use` meaning; split list/read, create,
  edit, role/relationship change, disable, invite, export, and external side
  effects into separate actions;
- keep the 11 high-risk candidates non-delegable by default until security
  reviews target resolution, approval, expiry/revocation, and audit evidence;
- use the approved [P1-f client-details contract](../../rbac-v6/p1/p1-f-client-details-capability-semantics.md): one ordinary profile-edit action, no inferred `limited`/`full` distinction, and no page-wide permission alias; hold implementation until field/source and server-boundary evidence is complete;
- keep `staff.internal` as an identity/principal-state question until its
  consumers are inventoried; do not treat it as broad action authority; and
- defer job-role defaults and the AJ/CSC pilot until the golden rows and
  persona fixtures exist.

**Minimum evidence:** source decomposition, route/API/RLS/Edge boundary,
positive and negative persona cases, named security reviewer, and a rollback
or observation plan for any eventual vertical slice.

**Owner:** product/security. This row cannot be self-approved by a refactor.

### T1 — TOM P0.2/P0.3 QA run

**Recommendation:** approve exactly one disposable, synthetic, read-only run
against the ratified `unicorn-qa` project. The run should cover tenant strata,
personas, directory/detail/search/filter behavior, cross-tenant denial,
Realtime observations, query plans, browser waterfalls, and the local ghost
classifier oracle. No production URL, browser credential, mutation, or
outbound email is permitted.

**Still required before execution:**

- Carl confirms the QA project URL/ref;
- security issues a short-lived QA-only read identity or explicitly marks the
  missing persona `Inconclusive`;
- TOM approves the synthetic fixture manifest and reset/retention method;
- Carl names the operator and observation window; and
- operations names a private artifact location and retention period.

**Acceptance:** every required persona has pass/fail/inconclusive evidence;
QA metadata parity, negative tenant isolation, redacted traces, and query
plans are retained; no missing evidence is reported as pass.

**Rollback:** discard only the disposable fixture/artifacts per the approved
retention procedure; no production rollback is involved.

### T2 — TOM implementation gate

No approval is recommended yet for the directory contract, canonical writer,
membership migration, package normalization, Realtime publication changes,
RLS/grants, or schema cleanup. The current owner-disposition register and
P0.2/P0.3 packet establish the evidence needed first. Any future approval must
name the exact object, owner, canary, rollback, and audit entry.

### H1 — Client Health 54-tenant defaults

**Recommendation:** contain empty, failed, stale, invalid, or incomplete
burn/retention sources as caller-safe `unavailable`/unknown rather than
presenting `normal`/`stable` as an assessment. Preserve the operational
attention workflow and explain the source reason only in protected diagnostics.

**Tradeoff:** this may display less reassuring information and expose a data
quality gap, but accepting the current values creates a false-health signal
for all 54 active tenants.

**Acceptance:** dashboard, executive, portfolio, retention, and Ask Viv
consumers cannot classify missing inputs as healthy/stable; synthetic tests
cover empty/failed/stale/invalid cases; no replacement score is introduced.

**Rollback:** a feature switch can restore the prior presentation only if the
known-gap warning remains visible and the rollback owner is named. This is a
user-visible product decision and requires Carl/Client Health approval before
implementation.

### H2 — Forecast job disposition

**Recommendation:** do not restart either forecast function. Keep the legacy
tables/functions as evidence and mark their consumer result unavailable until
source/live-schema comparison, caller inventory, business ownership, synthetic
fixtures, a versioned run ledger, and a shadow/rollback plan exist.

**Owner:** Client Health/data owner, with Carl deciding any operational restart
or retirement action. A source mismatch or empty table is not enough evidence
to repair or delete a job.

### H3 — Consultant operational input

This is an external blocker, not an engineering approval. AJ/Ezel/consultant
reports are required for cadence, blocker ownership, intervention patterns,
quiet/data-insufficient examples, and pilot usefulness. Until consolidated,
H1 metric thresholds, confidence semantics, cohort selection, and consultant
acceptance criteria remain provisional.

### A1 — `AdminStageDetail.tsx` characterization

**Recommendation:** approve one shared planning/characterization pass across
RBAC, TOM, and Codebase Optimization. It should inventory route access, direct
and delegated reads/writes, stage/package identity, task/email/document
contracts, certification, audit/export, and version behavior. Client Health is
only added if a real downstream metric consumer is proven.

**Acceptance:** one owner/action ledger exists with an oracle and blocker for
each behavior-bearing seam; pure display seams are distinguished from state,
query, mutation, auth, and tenant-resolution seams.

**Rollback:** revert the documentation/test-only PR; no runtime rollback.

### A2 — `AdminStageDetail.tsx` extraction

Do not authorize behavior-bearing extraction yet. After A1, a pure display-only
split may be Codebase-owned if compiler proof and existing route behavior prove
no runtime contract moved. Any seam touching stage/package identity, tasks,
client commitments, email, certification, audit/export, or authorization must
route to TOM/RBAC (and Client Health if proven linked) with the Phase 4
characterization oracle.

## Recommended next unattended goal after remaining gate decisions

**Goal:** execute only the explicitly approved bounded packet(s) from the
[remaining gated approval packets](remaining-gated-approval-packets-2026-09-12.md),
stopping at credentialed/live or product/security boundaries.

Deliverables:

1. an owner-approved atomic RBAC row set and evidence-backed enforcement slice;
2. an owner-cleared AdminStageDetail seam with a named oracle; and
3. a preflight-complete, read-only TOM QA run if credentials, operator, and
   artifact ownership are separately supplied.

Until those decisions are supplied, only documentation, source reconciliation,
fixture preparation, and evidence templates can run unattended. H2/H3 and all
implementation cutovers remain explicitly gated.
