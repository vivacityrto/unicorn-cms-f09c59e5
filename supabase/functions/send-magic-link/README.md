# send-magic-link

Gated edge function for magic-link / recovery emails via
`auth.admin.generateLink` + Mailgun.

## Authz (before generateLink)

1. Require `Authorization: Bearer <jwt>` → `401 NO_AUTH` if missing
2. Require `email` in body → `400 MISSING_EMAIL`
3. `auth.getUser(token)` → `401 AUTH_FAILED` if invalid
4. Allow only if caller's email matches target **or**
   `check_permission(user.id, 'admin.team_users.manage', 'full')`
5. Otherwise `403 FORBIDDEN`

## Notes

- Orphan relative to the frontend Login path (`signInWithOtp`)
- Replaces the retired unauthenticated `auth-send-magic-link` orphan
- `redirectTo` is pinned to `APP_BASE_URL` (never taken from the request body)
