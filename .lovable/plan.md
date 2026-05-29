Create a new edge function `supabase/functions/generate-recovery-link/index.ts` based on `send-password-reset` with three targeted changes:

1. **Restrict to Super Admin only** — Remove `isTenantAdmin` path and cross-tenant guard. Keep only the check `callerData.unicorn_role === "Super Admin" && (callerData.user_type === "Vivacity" || callerData.user_type === "Vivacity Team")`. Return `403 { ok: false, code: "INSUFFICIENT_PERMISSIONS" }` otherwise.

2. **Remove all Mailgun/email logic** — Strip MAILGUN env vars, Mailgun fetch, email HTML template construction, and the success response message.

3. **Return the action_link directly** — After `generateLink` succeeds, return `200 { ok: true, action_link: <linkData.properties.action_link>, email: <targetUser.email> }`.

Everything else is kept as-is:

- Inline CORS preflight and headers
- Auth token extraction via `Authorization` header
- Caller lookup from `public.users`
- Target user lookup from `public.users`
- `auth.users` existence check via `listUsers` (return `400 AUTH_USER_NOT_FOUND` if missing)
- `generateLink` call with `type: "recovery"` and `redirectTo: ${origin}/reset-password`
- `audit_eos_events` insert with `action: "recovery_link_copied"`
- Catch-all `500 UNEXPECTED_ERROR` handler
- No changes to any other file, edge function, database table, or UI component.