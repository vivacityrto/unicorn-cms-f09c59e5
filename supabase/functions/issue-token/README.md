# issue-token (historical / still-hosted)

Still ACTIVE on production (`yxkgdalkbrriasiyyrwk`). Custom opaque-token mint
for Mailgun-delivered reset/invite/magic/setpwd flows.

Vendored into the keeper repo as part of closing **H3** / token-issuance
hardening from the 14–15 Jul 2026 Unicorn security audit follow-up:

- Gateway `verify_jwt` alone is not sufficient (anon key is a valid JWT).
- Caller must present a bearer token; `admin.auth.getUser(token)` must succeed
  (401 otherwise). Service-role internal callers (e.g. `invite-or-reset-user`)
  pass via `isTrustedInternalCall`.
- Issuing for a different email than the caller requires
  `check_permission(..., 'admin.team_users.manage', 'full')`.
- The raw opaque token is **never** returned in the HTTP response — it is
  emailed via the existing Mailgun send path; the API returns a success ack.

## Caller / permission key

| Caller | Auth | Notes |
|--------|------|--------|
| `invite-or-reset-user` | Service-role `functions.invoke` | Only in-repo caller; already gates with `admin.team_users.manage` / `full` |
| Frontend UI | — | **None** found |

Feature key `admin.team_users.manage` matches the parent admin user-management
flow (invite/reset). Confirmed against in-repo callers and the prior H3 PR
co-authored with Angela; there is no narrower UI-specific feature key because
no UI invokes this function directly.

Do **not** stub-redeploy a 410 — deploy the patched source when ready:

```bash
supabase functions deploy issue-token --project-ref yxkgdalkbrriasiyyrwk
```
