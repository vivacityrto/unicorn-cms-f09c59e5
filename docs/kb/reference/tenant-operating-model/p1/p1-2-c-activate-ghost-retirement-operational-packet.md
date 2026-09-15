# TOM P1.2-c — `activate-ghost-user` operational retirement packet

> **Last updated:** 2026-09-15 · **Status:** planning-only; no disable or delete action authorized
> **Owner:** TOM, with operations and RBAC review
> **Evidence source:** [P1.2-c retirement evidence](p1-2-c-activate-ghost-retirement-evidence.md)
> **Decision source:** [P1.2-c retirement decision packet](p1-2-c-ghost-activation-retirement-decision-packet.md)

## Purpose and authority boundary

This packet prepares a reversible operational runbook for a possible later
retirement of the legacy `activate-ghost-user` Edge Function. It is not an
authorization to disable, delete, redeploy, or change the function. It also
does not authorize job closure, account repair, invitation, migration, schema,
RLS, credential, or production work.

The current safe state remains the deployed function with the merged
fail-closed guards in `bulk-account-actions` and
`cohort-access-sender-worker`. Any execution requires a fresh approval of the
exact target, action, timing, rollback owner, observation window, and post-action
checks recorded below.

## Observed target state (read-only, 2026-09-15)

The connected Supabase control plane returned the following exact target. The
operator must re-confirm the project identity immediately before any action;
the project/environment classification must not be inferred from a local
session.

| Field | Observed value |
| --- | --- |
| Supabase project ref | `qfpxvumcrnzrjyvqkicq` |
| Function slug/name | `activate-ghost-user` |
| Function ID | `28e6a1be-5a06-41e1-a47b-cb5ca6fb68c4` |
| Current status | `ACTIVE` |
| Current version | `304` |
| `verify_jwt` | `false` (the function performs its own bearer-token and permission checks) |
| Entry point | `supabase/functions/activate-ghost-user/index.ts` |
| Observed deployment digest | `61e22bd035e5aba3bea946d17a54b6f42d33a34d1299736c87e28f58063f5ec4` |
| Caller guards | `bulk-account-actions` v284 and `cohort-access-sender-worker` v283, both fail closed before legacy invocation/item lease |

The digest and version are identification evidence, not a rollback guarantee.
Before execution, the operator must privately capture a verified rollback
artifact and confirm that it can be restored through the authorized Supabase
control plane.

## Required approvals before execution

| Gate | Required decision or evidence | State |
| --- | --- | --- |
| Environment | Confirm the exact project ref and whether the requested action is QA, production, or another hosted target | **Carl must specify** |
| Action | Choose disable-first as the reversible first step, or explicitly approve direct deletion; direct deletion is not recommended | **Carl must specify** |
| Timing | Name the execution window and confirm no conflicting release, job, or support activity | **Carl must specify** |
| Rollback owner | Name the person who can restore the function and approve the rollback trigger | **Carl must specify** |
| Rollback artifact | Privately verify the version-304 source/digest or an equivalent redeployable artifact is available | **Required preflight** |
| Observation window | Set the minimum post-action observation period; recommended default is 60 minutes unless Carl chooses another | **Carl must specify** |
| Post-action checks | Approve the exact request/log/audit checks and abort thresholds below | **Required preflight** |
| RBAC review | Claude's replacement-path review remains complete; any new RBAC implication is a separate review | Complete for current evidence |

Until the Carl-owned fields are filled and approved, this packet remains
planning-only.

## Preflight checklist

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
8. Confirm the execution window, observation window, and approved action match
   the target environment. Do not proceed on a stale approval or an implicit
   environment assumption.

## Recommended execution shape (not authorized)

If and only if the approvals above are complete, use this sequence:

1. Record the final preflight metadata and current aggregate evidence.
2. Apply the platform-supported **disable** action to the exact function ID;
   do not delete the deployment in the first step.
3. Verify the control-plane state and record the platform's actual response to
   the exact legacy path. Do not assume a particular HTTP status without
   observing the platform result.
4. Observe the approved window while checking for unexpected legacy-path
   requests, new activation audit events, and errors in the preserved reset
   path. Keep all evidence aggregate or redacted.
5. If the observation window is clean, stop and obtain a separate approval for
   any later deletion. A clean disable observation does not itself authorize
   deletion.

Direct deletion is a separate, harder-to-reverse action. It requires a new
target check, a verified redeployable rollback artifact, a named rollback
owner, and explicit approval for deletion after the disable observation.

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

**Related audit entries:** [aggregate legacy-profile classification and log-retention gap](../../../../audit-log/entries/2026-09-15-tom-p12c-aggregate-legacy-profile-classification.md); [durable ghost-activation audit correlation](../../../../audit-log/entries/2026-09-15-tom-p12-ghost-retirement-audit-correlation.md); [disabled tenant-parent/admin authorization gap](../../../../audit-log/entries/2026-09-15-gate-tenant-parent-and-admin-safe-on-disabled.md)
