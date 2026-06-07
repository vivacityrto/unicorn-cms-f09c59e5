## Fix scanner-burn in password reset emails

GoTrue's `action_link` (the raw `…/auth/v1/verify?token=…` URL) is one-time-use. Corporate mail scanners (Outlook Safe Links, AV) fetch it on delivery and burn the token before the recipient clicks. Both reset functions currently embed that raw link directly, so users see "Invalid or expired link". Fix: extract the token server-side and email a scanner-safe `/activate?token=…&type=recovery&email=…` URL pointing at our own landing page, which already handles the recovery exchange.

### Files changed (exactly two)

**`supabase/functions/send-password-reset/index.ts`**

1. After the existing `resetLink` null-guard (line 166), insert the transform:

   ```ts
   // Transform raw GoTrue link into scanner-safe /activate URL
   const actionUrl = new URL(resetLink);
   const rawToken = actionUrl.searchParams.get('token');
   if (!rawToken) {
     console.error("Could not extract token from action_link");
     return new Response(
       JSON.stringify({ ok: false, code: "TOKEN_EXTRACT_FAILED" }),
       { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
     );
   }
   const safeResetLink = `${APP_BASE_URL}/activate?token=${encodeURIComponent(rawToken)}&type=recovery&email=${encodeURIComponent(targetUser.email)}`;
   ```

2. In the email HTML, replace the three `${resetLink}` occurrences (button href, fallback `<a href>`, fallback link text) with `${safeResetLink}`.
3. Change `<strong>⚡ This link expires in 1 hour.</strong>` to `<strong>This link expires in 24 hours.</strong>`.

**`supabase/functions/send-self-password-reset/index.ts`**

Identical changes:
1. Same transform block inserted after the `resetLink` null-guard (line 110).
2. Same three `resetLink` → `safeResetLink` swaps in the email HTML.
3. Same expiry copy fix (`⚡ … 1 hour` → `This link expires in 24 hours`).

### What is NOT touched

- Auth checks, role checks, cross-tenant guard, Mailgun config/send, audit logging, CORS, error handling — all preserved verbatim.
- `ActivateAccount.tsx`, `ResetPassword.tsx`, `recoveryLink.ts`, `resend-invite/index.ts`, any other function/page/component.
- No DB/RLS/trigger changes.

### Correctness notes

- `linkData.properties.action_link` from `auth.admin.generateLink({ type: 'recovery' })` is of the form `https://<project>.supabase.co/auth/v1/verify?token=<hashed>&type=recovery&redirect_to=<APP_BASE_URL>/reset-password`. `searchParams.get('token')` is the right extraction; `type=recovery` is appended explicitly so `/activate` doesn't depend on GoTrue's query order.
- `safeResetLink` lives on our own domain, so scanners that prefetch it hit React routing, not the GoTrue verify endpoint — the token survives until the user actually clicks.
- Null-token guard returns `TOKEN_EXTRACT_FAILED` (500) instead of silently sending a broken email.
- `targetUser.email` is already loaded in both functions before this block, so no extra query.
- Backward compatible: the GoTrue token is unchanged; only the URL that wraps it differs. Existing `/activate` handler already supports `token` + `type=recovery`.