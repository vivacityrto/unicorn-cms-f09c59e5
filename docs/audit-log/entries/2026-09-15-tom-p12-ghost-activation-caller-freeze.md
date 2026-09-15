# 2026-09-15 — TOM P1.2-c freeze indirect ghost activation callers

## Scope and authorization

Carl approved a bounded implementation to freeze the two remaining indirect
dispatch paths to the legacy `activate-ghost-user` Edge Function. The change
must preserve password-reset behavior and must not drain or mutate existing
cohort jobs, query provider logs, delete or redeploy the legacy function, alter
invitations, or change production data.

## Implementation

- [PR #1356](https://github.com/vivacityrto/unicorn-cms-f09c59e5/pull/1356),
  candidate commit `8a766d5187db7d2b6a7026cc9bd41af7f3aea68b`.
- `bulk-account-actions` now returns HTTP 410 with
  `GHOST_ACTIVATION_RETIRED` for `action = "activate"` before user lookup or
  sender invocation; `reset` remains routed to `send-password-reset`.
- `cohort-access-sender-worker` now returns the same fail-closed 410 for
  activation jobs before leasing any item; reset jobs retain their existing
  sender, throttle, outcome, and finalisation behavior.
- Existing `activate-ghost-user` deployment/configuration and compatibility
  references remain unchanged. No job row, invitation, auth identity,
  membership, contact, or production/runtime state was changed.

## Verification

- Focused retirement guard tests: 2 passed.
- `npm run lint:ratchet`: passed with zero regressions in both changed Edge
  Function files.
- `npm run typecheck`: passed.
- `npm run test:frontend`: 582 passed, 43 skipped.
- `npm run test:edge`: passed, including both new retirement guard tests.
- Static candidate census found no executable caller that invokes
  `activate-ghost-user`; remaining references are guards, configuration,
  compatibility, documentation, or migration-history references.

## Boundary and next action

This closes the static indirect-caller implementation gate only. The job-state
census, owner-approved historical invocation-log review, outstanding-account
census, post-merge repository census, RBAC/security review, and any later Edge
Function disable/delete operation remain separately gated.
