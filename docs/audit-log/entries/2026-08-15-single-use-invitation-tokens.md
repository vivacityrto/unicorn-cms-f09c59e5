# Audit: 2026-08-15 — single-use-invitation-tokens

**Trigger:** ad-hoc (invitation tokens were reusable after a successful password set)
**Scope:** `user_invitations` claim path in `set-invite-password`, plus the sibling
`auth_tokens` pair `consume-token` / `mark-token-used`. Did not rewrite
`accept_invitation_v2`'s own consume step (it already marks `status='accepted'`
and treats `successful` as `ALREADY_ACCEPTED`).

## Findings

- `set-invite-password` looked up a pending, unexpired `user_invitations` row
  and set the auth password, but never updated the invitation. A second call
  with the same token could set the password again.
- `user_invitations` had no `used_at` column. Live status CHECK allowed
  `pending/sent/expired/failed/accepted/revoked` only — not `successful`,
  even though `accept_invitation_v2` already treats `successful` as consumed
  and Manage Invites already has a `successful` badge.
- `mark-token-used` updated `auth_tokens.used_at` without requiring
  `used_at IS NULL`, so two concurrent callers could both receive 200.
- `consume-token` already refused used/expired rows, but returned 400 for
  both "already used" and "unknown/expired".
- Write-path sweep before adding nullable `used_at`: frontend `.from('user_invitations')`
  writers do not INSERT this column; live RPCs that mention the table
  (`accept_invitation_v2`, `admin_fix_invitations`, `admin_fix_memberships`,
  `get_client_tenant_users`, `invite_user`) do not need to supply a nullable
  column. Triggers on the table are expiry, role-ceiling, updated_at, and
  invitation timeline events.

## KB changes shipped

- no changes

## Code changes (this entry accompanies one)

- DDL migration `20260815080000_user_invitations_used_at.sql`: add
  `used_at timestamptz`, allow `successful` on the status CHECK, fire the
  accepted-timeline trigger on `successful` as well as `accepted`,
  `NOTIFY pgrst, 'reload schema'`. Applied via Supabase MCP `apply_migration`
  to `yxkgdalkbrriasiyyrwk` as a separate change from the function deploys.
- `set-invite-password`: reject non-pending or expired tokens on entry;
  claim with a conditional `UPDATE ... WHERE token_hash AND status='pending'
  AND expires_at > now() RETURNING id` *before* `updateUserById`; empty
  RETURNING → 410 `TOKEN_CONSUMED` and no password set.
- `mark-token-used`: same conditional-claim pattern on `auth_tokens`
  (`used_at IS NULL` and unexpired); empty RETURNING → 410.
- `consume-token`: return 410 when the hash matches a row that already has
  `used_at` (still does not mark used — that stays on `mark-token-used`).
- Companion: `resend-invite` refuses `successful` / `used_at`; Manage Invites
  treats `successful` as verified; Accept Invitation surfaces `TOKEN_CONSUMED`.

## Decisions

- Claim before password, not after, so a concurrent second request cannot
  set a password on an already-claimed token. If password update fails after
  a successful claim, the token stays consumed (explicit tradeoff).
- Keep `consume-token` validation-only. The `auth_tokens` claim lives in
  `mark-token-used`, matching the existing two-phase design.
- Added `successful` to the CHECK rather than claiming as `accepted`, so the
  UPDATE matches the requested status and does not collide with
  `accept_invitation_v2`'s later `accepted` write on the regular signup path.

## Open questions parked

- `accept_invitation_v2` still does SELECT-then-UPDATE without a
  `status='pending'` predicate on the UPDATE. Concurrent double-accept on
  the regular (non-ghost) signup path is a similar race, not closed here.
- Ghost activations claimed as `successful` skip `accept_invitation_v2`'s
  membership writes (`ALREADY_ACCEPTED`). That is safe for
  `activate-ghost-user` (membership is created at activation time). The
  never-signed-in fallback in `set-invite-password` could theoretically
  skip membership if those rows were not already provisioned.
