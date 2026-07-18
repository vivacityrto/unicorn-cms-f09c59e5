# admin-reset-user (retired)

Auth-gated orphan on production (`yxkgdalkbrriasiyyrwk`). Accepted `{ email }`
from Vivacity Super Admins and called `admin.generateLink` (recovery). No
in-repo callers — superseded by `generate-recovery-link` /
`send-password-reset`.

- **Callers:** none in this repo (`TenantUsersTab` / `AdminActions` use
  `generate-recovery-link`)
- **Survivor:** `generate-recovery-link` (gated:
  `admin.team_users.manage` / `full`)
- **Neutralization:** HTTP `410` stub (`FUNCTION_RETIRED`), same pattern as
  `auth-send-magic-link` / `create-session` / C1

Do **not** restore the historical generateLink path. Shared helper
`../_shared/admin-authorization.ts` (`canAdministerPasswords`) is retained
for keeper-repo history only.
