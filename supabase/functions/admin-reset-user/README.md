# admin-reset-user (deprecated — historical)

Superseded by `generate-recovery-link` and `send-password-reset`, which gate on
`check_permission(..., 'admin.team_users.manage', 'full')`.

Kept for history after the 14 Jul 2026 Unicorn security audit keeper-repo
reconciliation. The function remains ACTIVE and correctly gated on production
(`yxkgdalkbrriasiyyrwk`); there are no in-repo callers (orphan, same pattern as
`create-session` / C1). Do **not** redeploy a 410 stub — unlike C1 this endpoint
is already auth-gated and not exploitable as an unauthenticated session mint.

Shared helper: `../_shared/admin-authorization.ts` (`canAdministerPasswords`).
