# Audit: 2026-08-17 — claimed invitation completion

**Trigger:** post-security-remediation consequence audit of PR #296's single-use invitation token change.
**Scope:** `set-invite-password`, the invitation acceptance UI, production `accept_invitation_v2`, and all production functions/triggers writing `user_invitations`. No invitation data was changed during the audit.

## Findings

- PR #296 correctly claims a ghost-account invitation before setting its password, changing its status from `pending` to `successful` to enforce single use.
- The production `accept_invitation_v2` function only selects `pending` rows. For a claimed ghost invitation it returned `ALREADY_ACCEPTED` before creating `users`, `tenant_users`, `tenant_members`, or the active tenant relationship. The UI treated that response as success and redirected the user.
- Production currently has no `successful` invitation rows, so there is no identified affected user to repair. The defect remains reachable for the next ghost-account activation.
- The live body of `accept_invitation_v2` contains a later, richer implementation not present in any committed migration. Replacing it from the stale local migration would regress unrelated role/membership behavior, so this fix deliberately reuses the live canonical function rather than overwriting it.

## KB changes shipped

- no changes

## Code changes (if this entry accompanies one)

- Add `complete_claimed_invitation`, a signed-in-user-only `SECURITY DEFINER` wrapper that locks a `successful` row, restores `pending` only inside the transaction, and immediately invokes the canonical acceptance function.
- Route only the ghost password-activation branch to the wrapper; ordinary signup and normal sign-in invitation completion stay on `accept_invitation_v2`.
- Add source-level regression coverage for the row lock, identity binding, canonical handoff, and UI routing.

## Decisions

- Preserve the single-use claim-before-password guard. Do not revert it to regain membership creation.
- Reconcile the complete live `accept_invitation_v2` definition into repository migration history as a separate drift-remediation task; it is too large and behavior-bearing to bundle into this targeted user-impact fix.

## Open questions parked

- Confirm after deployment with a controlled ghost-account test that the complete path creates the expected `users`, `tenant_users`, and `tenant_members` records exactly once.
