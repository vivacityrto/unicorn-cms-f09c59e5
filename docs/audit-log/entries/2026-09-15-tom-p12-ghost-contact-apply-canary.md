# 2026-09-15 — TOM P1.2-d one-row ghost-contact QA apply canary

## Scope and authorization

Carl approved the P1.2-d design, a fresh private identifier-bearing manifest,
the dedicated server-side QA-only write boundary, exactly one `unicorn-qa`
canary row, and the batch/audit evidence shape. Production, invitations,
ghost retirement, and the remaining QA candidates were explicitly out of
scope.

## Hosted evidence

- Target: allowlisted `unicorn-qa` project `qfpxvumcrnzrjyvqkicq`; no
  production flag or target was used.
- Apply workflow: `34925511314`.
- Source commit: `9946b1226ebf25121a61663e134914aa5676e22d`.
- Fresh private report run: `574d1e7a-aebc-42f5-a1ed-014a5f5e2def`.
- Private batch ID: `b9eb486c-a4f2-4bc1-8a89-de07d72a9c99`.
- Frozen candidate count: 15; selected row index: 0.
- Result: `created`; one contact projection and one durable audit row were
  created; one write operation was performed; out-of-scope writes: 0.
- The workflow returned only redacted evidence, then removed its private
  manifest, report, SQL, and CLI output.

## Postflight and repeat reconciliation

The protected read-only postflight in the same workflow verified:

- one contact row and one audit row for the canary batch;
- the source profile still exists and remains a ghost;
- tenant-user and tenant-member evidence still matches;
- no pending invitation exists; and
- out-of-scope writes: 0.

A fresh read-only classifier then completed as workflow `34925622846` with
zero writes. Its redacted counts were:

| Count | Result |
| --- | ---: |
| Total ghost profiles | 15 |
| Membership-bearing profiles | 15 |
| Membershipless quarantine | 0 |
| Tenant candidate rows | 15 |
| Eligible candidates | 14 |
| Existing-contact matches | 1 |
| Pending-invitation matches | 0 |
| Collision/manual rows | 0 |
| Projected future inserts | 14 |

The one-row canary therefore reconciles exactly: one candidate became an
existing contact match, while the remaining 14 candidates were untouched.
No invitation, activation, membership, source-profile, production, or
runtime change occurred.

## Boundary and next action

The implementation and canary evidence are complete for this bounded packet.
The remaining 14 rows require a separate bounded-batch approval and must not
be inferred from this one-row authorization. `activate-ghost-user` retirement
and production/runtime work remain independently gated.
