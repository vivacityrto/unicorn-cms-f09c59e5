

## Plan: Fix both password reset failures

### Bug 1 — "Forgot Password?" sends no email (silent failure)

**Root cause** (confirmed in edge function logs):
`send-self-password-reset/index.ts` line 56 selects a non-existent column:
```ts
.select("user_uuid, email, first_name, last_name, tenant_id, status")
```
The `users` table has no `status` column (it has `state` and `disabled`). PostgREST returns an error, the function falls through to "non-existent email" and silently returns success without sending. Logs prove it:
```
Password reset requested for non-existent email: carl@vivacity.com.au
```
…even though Carl exists with `disabled=false`.

**Fix** — `supabase/functions/send-self-password-reset/index.ts`:
1. Replace the select column list with valid columns: `user_uuid, email, first_name, last_name, tenant_id, disabled`.
2. Replace the active-user check (lines 72–79) to use `disabled`:
   ```ts
   if (targetUser.disabled) { /* return success silently */ }
   ```
3. Use case-insensitive lookup: `.ilike("email", normalizedEmail)` (matches the rest of the codebase pattern) so any casing variant works.

---

### Bug 2 — Admin "Send Password Reset Email" link shows "Invalid or expired link"

**Root cause**:
`send-password-reset` generates a Supabase recovery `action_link` that, when clicked, redirects to `/reset-password` with auth tokens in the **URL hash** (`#access_token=…&type=recovery`). The current `ResetPassword.tsx`:
```ts
useEffect(() => {
  supabase.auth.getSession().then(...)  // runs immediately on mount
  if (!session) { /* show invalid + redirect to /login */ }
}, []);
```
This fires **before** Supabase's client has a chance to consume the hash and create a session, so `getSession()` returns null → user is bounced to login with "Invalid or expired link".

**Fix** — `src/pages/ResetPassword.tsx`:
1. Subscribe to `supabase.auth.onAuthStateChange` BEFORE calling `getSession()` (standard Supabase pattern, already documented in the project's auth knowledge).
2. Specifically watch for the `PASSWORD_RECOVERY` event (Supabase emits this when a recovery hash is consumed) — when received, set `isValidToken=true`.
3. Keep the `getSession()` call as a fallback for sessions that already exist.
4. Only show the "Invalid or expired link" toast and redirect if BOTH (a) no session arrives within ~1.5s, AND (b) no `PASSWORD_RECOVERY` event has fired. Use a single `setTimeout` guarded by a ref so the recovery event can cancel it.
5. Clean up the subscription on unmount.

This matches the pattern Supabase requires for recovery flows and resolves the race condition.

---

### Files changed
- `supabase/functions/send-self-password-reset/index.ts` — fix column list + use `disabled` + case-insensitive email match.
- `src/pages/ResetPassword.tsx` — listen for `PASSWORD_RECOVERY` auth event, eliminate race condition.

### Out of scope
- `send-password-reset` (admin-triggered) edge function is working correctly (email sent successfully per logs) — no changes there.
- No DB schema changes, no Mailgun config changes, no new routes.

### Verification after fix
1. Click "Forgot Password?" with `carl@vivacity.com.au` → email arrives within ~30s.
2. Click the link in either email → `/reset-password` shows the new-password form (not the "Invalid or expired link" toast).
3. Submit new password → success toast → redirected to `/login`.
4. Admin "Send Password Reset Email" from a user profile → same successful flow.

