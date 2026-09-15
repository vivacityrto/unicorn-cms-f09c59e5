# 2026-09-15 — TOM P1.2-c retirement packet target approved as `unicorn-qa` only

## Decision

Carl approved the next operational packet's target as the allowlisted
`unicorn-qa` project only:

- project ref: `qfpxvumcrnzrjyvqkicq`;
- URL: `https://qfpxvumcrnzrjyvqkicq.supabase.co`; and
- production: explicitly out of scope.

## Boundary

This decision authorizes target selection for the planning and QA-only packet
only. It does not authorize disabling, deleting, redeploying, or otherwise
changing `activate-ghost-user`; it does not authorize a production operation,
job mutation, account repair, invitation, migration, credential change, or
Edge action. The remaining action, timing, rollback-owner, and observation
window decisions remain open.
