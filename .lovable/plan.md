## Plan: Add action_link fallback for ghost activation email failures

### Context
When the `activate-ghost-user` edge function successfully creates an auth account but fails to send the welcome email (e.g. Mailgun misconfigured), callers currently have no way to recover. They get a plain toast saying the email could not be sent, but no actionable link to share manually.

### Changes

**PART A — `supabase/functions/activate-ghost-user/index.ts`**

Add `action_link` to the success response payload. When `email_sent` is true, return `null`; otherwise return the generated recovery link so the caller can present a "Copy link" fallback.

````text
  action_link: emailSent ? null : actionLink,
````

**PART B — `src/components/client/TenantUsersTab.tsx`**

Update the `handleActivateGhost` email-failure toast branch:

1. If `data.action_link` is present, show a toast with a "Copy link" action button.
2. When clicked, copy `data.action_link` to the clipboard via `navigator.clipboard.writeText()`.
3. After copying, show a second confirming toast: "Link copied — paste it into Teams or email to the user directly."
4. If `data.action_link` is null or missing, fall back to the original plain toast.

The `email_sent === true` branch remains unchanged.

### Safety
- Existing callers ignore unexpected JSON fields; adding `action_link` is backward-compatible.
- The frontend only shows the copy button when `action_link` is truthy, so null/missing values safely fall back.

No other files are touched.