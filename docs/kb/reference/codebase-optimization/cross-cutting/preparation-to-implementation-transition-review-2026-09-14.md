# Preparation-to-implementation transition review — 2026-09-14

> **Status:** canonical cross-initiative truth-sync; preparation freeze and next-step ordering recorded
> **Evidence cutoff:** `origin/main@da10cd274ff150586f827666b01cbfa5a1b4c3c6`
> **Scope:** merged PR archaeology for #1178–#1289, current four-initiative plans and packets, and independent council review
> **Decision boundary:** documentation-only; no runtime, schema, authorization, deployment, credential, hosted-data, or production action
> **Audit entry:** none needed — this review changes documentation only

## Executive conclusion

The program has made substantial real progress, but it has also accumulated
repeated preparation and reconciliation documents. The correct next move is a
transition out of generic preparation:

- stop opening packet-refresh, status-refresh, or broad inventory PRs unless
  they contain new executable/live evidence, record a concrete decision, or
  support an explicitly authorized runtime slice;
- treat the existing ledgers, fixtures, validators, characterization results,
  and packets as the baseline rather than creating another copy of them; and
- move each initiative to one of three explicit states: implementation packet
  awaiting owner approval, externally blocked, or intentionally parked.

This is not a finding that the preparation was pointless. The merged history
contains security remediation, client-identity runtime behavior, Client Health
consumer containment, QA infrastructure, live characterization, and reusable
validators. The problem is that those real outcomes are mixed with a much
larger stream of packet maintenance, making completed evidence and remaining
gates harder to distinguish.

## Merged-PR archaeology

The review covered PRs #1178–#1289, using the merged PR metadata, commit
history, changed-file classifications, and the current authoritative docs.
The broad classification is:

| Class | Approximate count | Representative PRs | Meaning |
| --- | ---: | --- | --- |
| Runtime implementation | 9 | #1185, #1195, #1196, #1226–#1230, #1281 | Behavior, security, or Edge changes actually shipped |
| Evidence/tooling | 12 | #1199, #1254, #1259, #1263, #1270–#1271, #1282–#1284 | Scripts, validators, tests, E2E runs, or evidence capture |
| Documentation-only preparation/reconciliation | 91 | #1178, #1192–#1194, #1204–#1224, #1231, #1233–#1251, #1255–#1258, #1265, #1272–#1280, #1285–#1289 | New or expanded packets, worksheets, ledgers, matrices, refreshes, decision records, citations, and closeouts |

The counts are directional because some PRs combine documentation and
executable artifacts; the important result is the shape of the history, not
the exact bucket boundary. The dominant pattern is documentation and
reconciliation, not unshipped implementation. PR #1278 is an unrelated
Academy Sidekick research handoff and does not change the initiative gates.

### Behavior already shipped before later packet work

- Client identity and contact promotion behavior predates the latest packet
  sequence: #1195 and #1196 changed the contact projection and pending
  promotion UI, while later #1276, #1279, #1286, and #1289 mostly captured,
  reconciled, and bounded that existing surface.
- Client Health unavailable-state containment shipped in #1226–#1230. Later
  characterization and status PRs should be read as evidence and closeout,
  not as proof that containment is still unimplemented.
- The QA fixture/persona and evidence path is materially executable through
  #1199, #1254, #1259, #1263, and #1270–#1271. Later packets retain residual
  coverage and owner-review questions; they do not recreate the baseline.
- #1281 changed the Edge invitation adapter to support an explicit QA no-send
  mode. Production email behavior remains unchanged.
- #1185 was a real security/runtime remediation, not preparation: it added
  tenant-checked package boundaries and migrated callers. It must not be
  hidden under a generic “prep” label.

### Preparation that remains useful

The RBAC ledgers, TOM source/identity/write graphs, Client Health evidence
schemas and shadow ledger, QA validators, and AdminStageDetail ownership
characterization remain useful inputs. They should now be consumed by
decision-ready packets or implementation reviews rather than repeatedly
restated.

## Current four-initiative disposition

| Initiative | Current truth | Correct next state |
| --- | --- | --- |
| Codebase Optimization | Phase 4 slices 1–8 are closed; no Phase 4 slice 9 is recommended. Phase 5 has no authorized packet. | Keep Phase 4 closed. Do not start Phase 5 or behavior-bearing AdminStageDetail extraction without a new bounded packet, owner, and oracle. |
| RBAC v6 | P0.1 and broad P1 preparation are delivered, including the 85-feature/523-row inventory and validators. Capability rows remain candidates, not policy. | Freeze generic row churn. Obtain product/security review of a named atomic row set, then authorize one bounded read-only enforcement/evidence packet. No grants, role defaults, RLS, Edge, or cutover. |
| Tenant Operating Model | P0.1/P0.2/P0.3 evidence and QA preparation are substantially complete. P1.1 is a draft implementation packet; staff-only primary promotion and QA no-send boundaries are recorded. | Stop broad P0 preparation. Resolve the exact contact/membership/writer contract and packet owner, then authorize one implementation slice with focused tests, QA, rollback, and audit evidence. |
| Client Health Activity Analytics | Unknown-state containment is shipped; forecast jobs remain stopped and outputs unavailable. Consultant operational data is still outstanding. | Do not invent thresholds, confidence, cohorts, or pilot acceptance. Obtain consultant evidence; consider replacement shadow only through a separate approved packet. |

## Genuine remaining gates

The remaining work is narrower than the historical packet volume suggests:

1. **RBAC golden rows:** action, target, scope, relationship proof, denial
   behavior, owner, and first enforcement boundary must be reviewed for the
   selected rows. The existing ledger is evidence, not approval.
2. **RBAC pilot/shadow:** named cohort and resources, telemetry custody,
   retention, reviewer, rollback, and the 14-day observation contract remain
   prerequisites. No pilot enrollment or telemetry deployment is implied.
3. **TOM contact promotion:** the observed non-staff denial and the desired
   staff-only policy must be reconciled explicitly with the UI, Edge Function,
   invitation/membership contract, acceptance idempotency, and QA no-send mode.
   The current denial is behavior evidence, not a future-policy approval.
4. **TOM residual QA review:** the completed synthetic run still has
   inconclusive persona/coverage and cross-initiative owner-review items. Do
   not describe the whole QA packet as unrun.
5. **Client Health consultant input:** reports must cover cadence, blocker
   ownership, interventions, quiet/data-insufficient cases, and pilot
   usefulness before metric policy is finalized.
6. **AdminStageDetail and Phase 5:** any behavior-bearing extraction or new
   optimization phase needs a named owner, bounded contract, and real oracle.
7. **Parked decisions:** TOM tenantless-user classification and RBAC §13
   items 14/15 remain parked and must not be implicitly resolved by cleanup.

## Deduplicated operating rule

Use the following ownership for future work:

- the **program index** is the navigation/status source;
- the **decision ledger** is the source for settled decisions;
- the **remaining-gated approval packet** is the source for current gate
  evidence;
- initiative packets own their detailed contract and evidence; and
- dated approval/blocker matrices are snapshots, not reasons to reopen the
  same preparation cycle.

Any new PR should identify the exact gate it closes. If it only repeats an
existing inventory, packet, or status statement, do not open it. If it changes
runtime, schema, authorization, deployment, scheduled jobs, credentials, or
live data, it needs the separate authorization and verification required by
the owning plan.

## Next-step ordering

1. Resolve or explicitly accept the TOM/RBAC contact-promotion contract
   boundary; then select one implementation packet rather than another broad
   preparation pass.
2. Keep RBAC row review limited to a named, reviewable slice and preserve all
   unresolved rows as unresolved.
3. Wait for Client Health consultant reports while retaining the shipped
   unavailable/stopped-job posture.
4. Leave Codebase Optimization Phase 4 closed and defer Phase 5 until a
   specific packet is authorized.

This ordering is the handoff for a fresh session: the work is no longer to
“prepare everything.” It is to consume the existing preparation at the
smallest authorized boundary and stop at the next genuine decision or external
input.

## Verification

Documentation-only reconciliation. Run:

- `node scripts/check-kb-links.mjs`
- `node scripts/check-kb-doc-size.mjs`
- `git diff --check`

Runtime test suites and hosted/live verification are not applicable because
this review changes no runtime or environment state.
