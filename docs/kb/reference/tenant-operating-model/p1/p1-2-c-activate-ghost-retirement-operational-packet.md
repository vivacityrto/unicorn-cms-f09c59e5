# TOM P1.2-c — `activate-ghost-user` operational retirement packet

> **Last updated:** 2026-09-16 · **Status:** initial production deletion was observed, but an in-window redeployment invalidated the observation; closeout is blocked pending source reconciliation and a fresh decision
> **Owner:** TOM, with operations and RBAC review
> **Evidence source:** [P1.2-c retirement evidence](p1-2-c-activate-ghost-retirement-evidence.md)
> **Decision source:** [P1.2-c retirement decision packet](p1-2-c-ghost-activation-retirement-decision-packet.md)

## Purpose and authority boundary

This packet records the operational runbook and evidence for retiring the
legacy `activate-ghost-user` Edge Function. The earlier QA runbook was not an
authorization to act; Carl later separately approved the exact production
deletion. This packet does not authorize any additional deployment, job
closure, account repair, invitation, migration, schema, RLS, credential, or
production work.

The pre-action safe state was the deployed function with the merged
fail-closed guards in `bulk-account-actions` and
`cohort-access-sender-worker`. The post-action state is recorded below; the
guards and reset path remain deployed.

## Production execution reconciliation (2026-09-16)

After final read-only preflight, Carl gave explicit action-time approval for
permanent deletion of the production `activate-ghost-user` deployment. The
authorized control plane initially confirmed:

- project ref `yxkgdalkbrriasiyyrwk` was the target;
- the Edge Function inventory changed from 193 to 192;
- exact lookup of `activate-ghost-user` returned `Function not found`;
- current `bulk-account-actions` v285 and `cohort-access-sender-worker` v284
  still expose the `GHOST_ACTIVATION_RETIRED` fail-closed guards, and the
  worker remains reset-only; and
- activation-job counts were zero for open, locked, and unprocessed rows,
  with four historical non-open jobs retained.

No job, account, invitation, or unrelated function write was performed during
the initial deletion. The final read-only cutoff found inventory back at 193
and version 1 of `activate-ghost-user` present/ACTIVE again after an
in-window redeployment. The observation is invalidated; no further hosted
action is authorized by this packet until the redeployment source is
reconciled and a fresh decision is obtained.

## Observed target state (read-only, 2026-09-15)

The connected Supabase control plane returned the following exact target. The
operator must re-confirm the project identity immediately before any action;
the project/environment classification must not be inferred from a local
session.

| Field | Observed value |
| --- | --- |
| Supabase project/environment | `unicorn-qa` only; production explicitly out of scope |
| Supabase project ref | `qfpxvumcrnzrjyvqkicq` |
| Supabase project URL | `https://qfpxvumcrnzrjyvqkicq.supabase.co` |
| Function slug/name | `activate-ghost-user` |
| Function ID | `28e6a1be-5a06-41e1-a47b-cb5ca6fb68c4` |
| Current status | `ACTIVE` |
| Current version | `304` |
| `verify_jwt` | `false` (the function performs its own bearer-token and permission checks) |
| Entry point | `supabase/functions/activate-ghost-user/index.ts` |
| Observed deployment digest | `61e22bd035e5aba3bea946d17a54b6f42d33a34d1299736c87e28f58063f5ec4` |
| Caller guards | `bulk-account-actions` v284 and `cohort-access-sender-worker` v283, both fail closed before legacy invocation/item lease |

## Historical QA preflight (2026-09-15, aborted)

The approved `unicorn-qa` project was re-confirmed through the
project-specific control plane at `qfpxvumcrnzrjyvqkicq`. Its current Edge
Function inventory contains only two functions (`tenant-lifecycle` and
`invite-user`); an exact lookup for `activate-ghost-user` returned
`Function not found`. The same read-only control plane reported 15 auth users,
no cohort jobs, and no activation-job rows, which is not the previously
documented QA state.

A separate Supabase connector pointed at a different project and returned the
historical target metadata above, but that project is not the approved QA
target and was not used for action. The final preflight therefore aborted
before any disable, delete, redeploy, or other hosted change. The historical
metadata must not be treated as current `unicorn-qa` target evidence until the
QA deployment identity is reconciled through the approved project control
plane.

The digest and version are identification evidence, not a rollback guarantee.
Before execution, the operator must privately capture a verified rollback
artifact and confirm that it can be restored through the authorized Supabase
control plane.

## Required approvals before execution

| Gate | Required decision or evidence | State |
| --- | --- | --- |
| Environment | `unicorn-qa` only (`qfpxvumcrnzrjyvqkicq`); production is explicitly out of scope | **Approved by Carl 2026-09-15** |
| Current target presence | The exact `activate-ghost-user` function must be present in the approved `unicorn-qa` project before any action | **Failed final preflight 2026-09-15; abort** |
| Action | Disable-first in `unicorn-qa`; direct deletion deferred until after a separate clean observation and approval | **Approved by Carl 2026-09-15; execution not authorized** |
| Timing | Next supervised QA window, immediately after final preflight passes; no unattended or scheduled run | **Approved by Carl 2026-09-15; execution still requires passing preflight** |
| Rollback owner | Carl, per [ADR-028](../../decision-trail.md#adr-028), can restore the function and approve the rollback trigger; no separate delegation | **Established by Carl's standing TOM decision; run-specific rollback readiness remains required** |
| Rollback artifact | Privately verify the version-304 source/digest or an equivalent redeployable artifact is available | **Required preflight** |
| Observation window | Minimum 60 minutes after the verified disable; stop or roll back earlier on any abort threshold; a clean result does not authorize deletion | **Approved by Carl 2026-09-15; execution still requires preflight** |
| Post-action checks | Approve the exact request/log/audit checks and abort thresholds below | **Required preflight** |
| RBAC review | Claude's replacement-path review remains complete; any new RBAC implication is a separate review | Complete for current evidence |

Until the Carl-owned fields are filled and approved, this packet remains
planning-only.

## Preflight checklist (historical QA runbook)

The operator must stop without taking the action if any check fails:

1. Re-read the current evidence and decision packets and confirm that the
   approved holds for the two stale cancelled-job items and 31 never-signed-in
   ghost accounts remain unchanged.
2. Reconfirm the exact project ref, function ID, slug, status, version, and
   digest through the current Supabase control plane. A target mismatch is an
   immediate abort.
3. Reconfirm `bulk-account-actions` and `cohort-access-sender-worker` are
   deployed with their fail-closed activation guards and that reset behavior is
   unchanged.
4. Reconfirm no activation item is queued, running, failed, or locked, and
   that the two held cancelled-job items have not been mutated.
5. Reconfirm the static caller closure and the replacement workflow evidence;
   do not treat either as permission to repair accounts or invitations.
6. Capture a private, redacted preflight record containing only aggregate
   counts, function metadata, and timestamps. Do not commit identifiers,
   tokens, source secrets, or row-level exports.
7. Verify that the rollback artifact, rollback operator, and rollback trigger
   are all recorded. Missing rollback readiness is an abort condition.
8. Confirm the supervised execution window, observation window, and approved
   action match the target environment. Do not proceed on a stale approval, an
   unattended or scheduled run, or an implicit environment assumption.

## Historical QA execution shape (not executed)

If and only if the remaining approvals above are complete, use this sequence:

1. Record the final preflight metadata and current aggregate evidence.
2. Apply the platform-supported **disable** action to the exact function ID in
   `unicorn-qa`; do not delete the deployment in the first step.
3. Verify the control-plane state and record the platform's actual response to
   the exact legacy path. Do not assume a particular HTTP status without
   observing the platform result.
4. Observe the approved window while checking for unexpected legacy-path
   requests, new activation audit events, and errors in the preserved reset
   path. Keep all evidence aggregate or redacted.
5. If the observation window is clean, stop and obtain a separate approval for
   any later deletion. A clean disable observation does not itself authorize
   deletion.

The QA disable-first shape was not executed because the approved QA control
plane did not contain the historical target. Production deletion was instead
performed only after a fresh target check and explicit action-time approval;
the later in-window redeployment invalidated the final observation.

## Abort and rollback conditions

Abort before action for any target mismatch, missing guard, missing rollback
artifact, unresolved held job/item mutation, stale approval, or incomplete
environment classification. After a disable, invoke the approved rollback if
any unexpected legacy request, reset-path regression, audit anomaly, target
drift, or platform error occurs. The rollback must restore the verified
artifact through the authorized control plane; it must not repair accounts,
retry jobs, send invitations, or alter unrelated functions.

## Evidence and audit requirements

The operator must retain a private redacted record of:

- exact target metadata before and after the action;
- approval identifiers and named operators;
- action and timestamps;
- aggregate request/audit observations during the window;
- any abort or rollback decision; and
- the final disposition of the function.

No identifier-bearing evidence belongs in the repository, a shared checkout,
an issue, or chat. A dated operational audit entry is required for any actual
disable, rollback, or delete action. Until then, the existing evidence and
holds remain authoritative.

**Related audit entries:** [production deletion and observation](../../../../audit-log/entries/2026-09-16-tom-p12c-production-deletion-and-observation.md); [QA target approval](../../../../audit-log/entries/2026-09-15-tom-p12c-retirement-qa-target-approval.md); [action-shape approval](../../../../audit-log/entries/2026-09-15-tom-p12c-retirement-action-shape-approval.md); [supervised timing approval](../../../../audit-log/entries/2026-09-15-tom-p12c-retirement-timing-approval.md); [rollback-owner reconciliation](../../../../audit-log/entries/2026-09-15-tom-p12c-retirement-rollback-owner.md); [observation-window approval](../../../../audit-log/entries/2026-09-15-tom-p12c-retirement-observation-window.md); [final preflight abort](../../../../audit-log/entries/2026-09-15-tom-p12c-retirement-preflight-abort.md); [aggregate legacy-profile classification and log-retention gap](../../../../audit-log/entries/2026-09-15-tom-p12c-aggregate-legacy-profile-classification.md); [durable ghost-activation audit correlation](../../../../audit-log/entries/2026-09-15-tom-p12-ghost-retirement-audit-correlation.md); [disabled tenant-parent/admin authorization gap](../../../../audit-log/entries/2026-09-15-gate-tenant-parent-and-admin-safe-on-disabled.md)
