# invite-or-reset-user (historical / orphan)

Still ACTIVE on production (`yxkgdalkbrriasiyyrwk`). No in-repo callers — same
orphan pattern as `admin-reset-user` / `create-session`.

Vendored into the keeper repo as part of closing **H2** from the 14 Jul 2026
Unicorn security audit follow-up:

- Invite `redirectTo` is pinned to `APP_BASE_URL/reset-password` (never taken
  from the request body).
- Caller gate uses `check_permission(..., 'admin.team_users.manage', 'full')`
  plus an explicit `users.disabled` check (the live `role_type` column lookup
  was invalid and failed closed for everyone).

Target email remains hard-allowlisted to `angela@vivacity.com.au`. Do **not**
stub-redeploy a 410 — deploy the patched source when ready.

When the invite path falls through to reset, this function invokes `issue-token`
(service-role). That callee now emails the opaque token via Mailgun and returns
a success ack only — this caller must not forward raw token material.
