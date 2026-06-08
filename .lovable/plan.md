Fix two bugs in the ghost user activation flow.

Bug 1 — Misleading "welcome email could not be sent" toast (field name mismatch)
- File: `supabase/functions/activate-ghost-user/index.ts` line 271
- Change `invite_sent: emailSent` to `email_sent: emailSent` in the success response JSON
- This matches what `TenantUsersTab.tsx` already reads (`data.email_sent`), so the success toast fires correctly when Mailgun delivers the invitation email
- Verified: `invite_sent` has no other consumers in the codebase
- No other changes to this file

Bug 2 — `ghost_activation: true` never cleared after activation completes
- File: `supabase/functions/set-invite-password/index.ts`
- After the successful `updateUserById` password set (after the `if (updateErr)` block, around line 143), add a best-effort call to clear the flag:
  ```typescript
  try {
    await admin.auth.admin.updateUserById(authUser.id, {
      user_metadata: { ghost_activation: false },
    });
  } catch (clearErr) {
    console.warn("Failed to clear ghost_activation flag (non-fatal)", clearErr);
  }
  ```
- This wraps the metadata update in try/catch so a failure logs a warning but never aborts the 200 OK response
- Verified: `ghost_activation` is only set in `activate-ghost-user` and only read in `set-invite-password`
- No changes to the `NOT_GHOST_ACCOUNT` guard logic, no DB/RLS/trigger changes, no frontend changes

Affected files (exactly two):
- `supabase/functions/activate-ghost-user/index.ts`
- `supabase/functions/set-invite-password/index.ts`

No other files are touched.