# 2026-09-15 — TOM P1.2-d bounded ghost-contact QA batches

## Scope and authorization

Carl separately authorized the remaining 14 `unicorn-qa` candidates to be
processed as three deterministic atomic transactions of 5, 5, and 4 rows.
The runner had to require the exact remaining-candidate counts 14, 9, and 4
before each batch, stop on any mismatch or row failure, and complete a
read-only postflight before the next batch. Production, invitations,
activation, ghost retirement, RBAC, and Client Health work remained out of
scope.

## Hosted evidence

- Target: allowlisted `unicorn-qa` project `qfpxvumcrnzrjyvqkicq`; no
  production target or flag was used.
- Implementation PR: [#1348](https://github.com/vivacityrto/unicorn-cms-f09c59e5/pull/1348), merged source commit
  `244abb06369b372fc86e5c9ec999583e79ad7079`.
- Batch 1 workflow `34928094192`: fresh snapshot required 14 candidates;
  five contacts and five audit rows created; postflight verified five rows.
- Batch 2 workflow `34928192320`: fresh snapshot required 9 candidates;
  five contacts and five audit rows created; postflight verified five rows.
- Batch 3 workflow `34928288672`: fresh snapshot required 4 candidates;
  four contacts and four audit rows created; postflight verified four rows.
- Every batch reported zero out-of-scope writes, zero forbidden operations,
  intact source ghost state, matching tenant-user and tenant-member evidence,
  and zero pending invitations.
- Identifier-bearing manifests, SQL, reports, and CLI output stayed private
  to the protected workflow and were removed after each run. Only redacted
  summaries were retained.

## Terminal reconciliation

The final read-only classifier workflow `34928388148` completed with zero
writes and reported:

| Count | Result |
| --- | ---: |
| Total ghost profiles | 15 |
| Membership-bearing profiles | 15 |
| Membershipless quarantine | 0 |
| Tenant candidate rows | 15 |
| Eligible candidates | 0 |
| Existing-contact matches | 15 |
| Pending-invitation matches | 0 |
| Collision/manual rows | 0 |
| Projected future inserts | 0 |

Together with the prior one-row canary, the approved QA population reconciles
to 15 created contact projections and 15 audit rows. No source ghost,
membership ledger, invitation, auth identity, access grant, production, or
runtime state was changed.

## Boundary and next action

The approved P1.2-d QA contact projection is complete. Any ghost retirement,
invitation/activation behavior, or production/runtime change requires its own
packet and explicit approval.
