# 2026-09-15 — TOM P1.2-c ghost-account invitation reconciliation

## Scope and authorization

This was an aggregate-only read against the current `ghost_activation` auth
population, following the approved TOM P1.2-c census. It used invitation
existence checks without returning identifiers and made no live change.

## Observed state

- The population contains 41 auth users with `ghost_activation = true`: 31
  have never signed in and 10 have signed in.
- One has no matching invitation record.
- One has a currently open pending invitation under the expiry/revocation
  test.
- Thirty-eight have at least one invitation with `status = 'pending'` in
  their history. These counts are non-additive existence checks because one
  account can have multiple invitation records.
- Separately, the two pending items in cancelled activation jobs date from
  2026-06-03 UTC, are unprocessed, and belong to active primary contacts
  without the current ghost flag; they are not the 31-account cohort.

## Interpretation and boundary

The evidence requires account-level completion/hold classification rather than
a bulk cleanup based on the expired sent/no-token ledger. No invitation,
auth, profile, membership, job, or contact row was altered, and no Edge
Function retirement action was authorized.
