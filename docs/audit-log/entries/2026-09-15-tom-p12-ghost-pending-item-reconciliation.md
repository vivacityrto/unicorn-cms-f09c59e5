# 2026-09-15 — TOM P1.2-c pending-item reconciliation

## Scope and authorization

This was a follow-up aggregate-only read to the approved TOM P1.2-c census.
It reconciled the two pending rows in cancelled activation jobs without
returning identifiers. No job, invitation, auth, profile, membership, or
contact row was changed; no retry, close, delete, deployment, or Edge
retirement action was taken.

## Observed state

- Both rows have `state_snapshot = 'ghost'`, `planned_action = 'activate'`,
  and `outcome = 'pending'`.
- Both current profiles are active `primary_contact` profiles and neither
  currently carries `ghost_activation = true`.
- Both are never-signed-in, never locked, never attempted, and have no stored
  skip/failure reason.
- Both match an expired `sent` invitation with no token hash. Neither matches
  a `pending`, `accepted`, or `revoked` invitation.

## Interpretation and boundary

These are stale activation-job snapshots for already-classified primary
contacts, not the 31 currently ghost-flagged never-signed-in accounts. The
remaining operational decision is how to hold or close the stale job and
invitation artifacts. This evidence narrows that decision but does not make it
or authorize the legacy Edge Function's disable/delete operation.
