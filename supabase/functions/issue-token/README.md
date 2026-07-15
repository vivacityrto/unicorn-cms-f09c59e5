# issue-token (historical / still-hosted)

Still ACTIVE on production (`yxkgdalkbrriasiyyrwk`). Custom opaque-token mint
for Mailgun-delivered reset/invite/magic/setpwd flows.

Vendored into the keeper repo as part of closing **H3** from the 14 Jul 2026
Unicorn security audit follow-up:

- Gateway `verify_jwt` alone is not sufficient (anon key is a valid JWT).
- Service-role internal callers (e.g. `invite-or-reset-user`) pass via
  `isTrustedInternalCall` (`Authorization: Bearer <SERVICE_ROLE_KEY>`).
- Other callers must be the token subject (`isSelf`) or hold
  `admin.team_users.manage` / `full`.

Known in-repo caller: `invite-or-reset-user` (service-role invoke). Do **not**
stub-redeploy a 410 — deploy the patched source when ready.
