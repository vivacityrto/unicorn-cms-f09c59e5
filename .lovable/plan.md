# Plan — `set-invite-password` edge function

New file: `supabase/functions/set-invite-password/index.ts`. No JWT required (the invite token is the credential). Uses service-role client.

## Imports & setup
- `serve` from `std/http/server.ts`, `createClient` from `@supabase/supabase-js@2`, `corsHeaders` from `../_shared/cors.ts`.
- Same `json(status, body)` helper as other functions in this folder.
- Env: `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`.

## Handler flow
1. Handle `OPTIONS` preflight with `corsHeaders`.
2. Parse JSON body `{ token_plaintext, email, new_password }`.
3. Validate: all three present (strings), `new_password.length >= 8`. On failure → `400 { ok:false, code:'INVALID_INPUT', detail }`.
4. Hash `token_plaintext` with SHA-256 → hex `tokenHash` (same pattern used by `activate-ghost-user` / `validate_invitation_token`).
5. Look up `user_invitations` where `token_hash = tokenHash AND status = 'pending' AND expires_at > now()` (single row). If none → `{ ok:false, code:'INVALID_TOKEN' }` (400).
6. Compare `invitation.email.toLowerCase() === email.toLowerCase()`. Mismatch → `{ ok:false, code:'EMAIL_MISMATCH' }` (400).
7. Find auth user via `auth.admin.listUsers()` paginated (perPage 1000, up to 20 pages) — match by lowercased email. Not found → `{ ok:false, code:'AUTH_USER_NOT_FOUND' }` (404).
8. Gate: require `authUser.user_metadata?.ghost_activation === true`. Otherwise → `{ ok:false, code:'NOT_GHOST_ACCOUNT', detail:'Use your existing password or Forgot Password.' }` (403). This prevents an invite token from overwriting a real user's password.
9. `auth.admin.updateUserById(authUser.id, { password: new_password })`. On error → `500 { ok:false, code:'PASSWORD_UPDATE_FAILED', detail }`.
10. Best-effort audit insert into `audit_eos_events`:
    - `tenant_id: invitation.tenant_id`
    - `user_id: authUser.id`
    - `entity: 'users'`, `entity_id: authUser.id`
    - `action: 'ghost_password_set'`
    - `details: { email: authUser.email, invitation_id: invitation.id }`
11. Return `200 { ok:true, email: authUser.email }`.

All responses include `corsHeaders`. Errors are caught and returned as `500 { ok:false, code:'UNEXPECTED', detail }`.

## Out of scope
- No status flip on `user_invitations` (caller will mark accepted separately, or via existing accept flow). The function only sets the password.
- No JWT verification; relies on Lovable-managed `verify_jwt = false` default for new functions.
