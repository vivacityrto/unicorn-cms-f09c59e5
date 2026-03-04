

## Plan: Microsoft 365 Login + Graph Email Sending

### Codebase Scan — What Already Exists

| Component | Status |
|-----------|--------|
| Azure AD app registration secrets (`MICROSOFT_CLIENT_ID`, `MICROSOFT_CLIENT_SECRET`, `MICROSOFT_TENANT_ID`) | Already configured |
| OAuth token storage (`oauth_tokens` table, token exchange in `outlook-auth`) | Already implemented |
| Token refresh pattern (fetch token → check expiry → POST to Microsoft token endpoint → update `oauth_tokens`) | Duplicated in 5+ edge functions — well-established pattern |
| Scope management (`src/lib/microsoft/scopes.ts` + `_shared/microsoft-scopes.ts`) | Exists, needs `Mail.Send` added |
| `ComposeEmailDialog` (sends via `send-composed-email` / Mailgun) | Exists, needs Graph routing |
| `email_send_log` table for audit | Exists |
| `send-email-graph` edge function | Does NOT exist |
| M365 login on Login page | Does NOT exist |
| `OutlookCallback` page for OAuth code exchange | Exists at `/calendar/outlook-callback` |
| `useOutlookConnectionStatus` hook | Exists — reusable for checking Graph availability |
| User profile matching (`users.user_uuid = auth.users.id`) | Exists but assumes password-created users — needs handling for first-time OAuth logins |

### What Needs to Be Built

#### Part A: Microsoft 365 Login

**1. Supabase Dashboard Configuration (Manual)**
- Enable Azure provider under Authentication → Providers
- Enter existing `MICROSOFT_CLIENT_ID` and `MICROSOFT_CLIENT_SECRET`
- Add `https://yxkgdalkbrriasiyyrwk.supabase.co/auth/v1/callback` as a redirect URI in the Azure AD app registration

**2. `src/pages/Login.tsx`**
- Add a "Sign in with Microsoft 365" button below the existing login form, separated by an "or" divider
- On click: `supabase.auth.signInWithOAuth({ provider: 'azure', options: { scopes: 'openid profile email', redirectTo: window.location.origin + '/dashboard' } })`
- Existing email/password form remains unchanged

**3. User Profile Matching (Critical Gap)**
- Current flow: `useAuth` fetches from `users` table where `user_uuid = auth.uid()`. When a user signs in via M365 for the first time, Supabase creates a new `auth.users` record but there is no matching `public.users` row
- Solution: Create a database function + trigger on `auth.users` that, on insert, checks if a `public.users` row exists with a matching email but a null `user_uuid`, and links it automatically. This handles the case where users were invited (row exists) but sign in via M365 for the first time
- If no matching email exists, the user sees a "no profile" state (existing behaviour) — they must be invited first

#### Part B: Send Emails via Microsoft Graph

**4. Scope Update**
- `src/lib/microsoft/scopes.ts`: Change `MAIL_SCOPES` from `['Mail.Read']` to `['Mail.Read', 'Mail.Send']`
- `supabase/functions/_shared/microsoft-scopes.ts`: Same change
- Existing connected users will need to disconnect and reconnect to consent to the new scope

**5. New Edge Function: `send-email-graph`**
- `supabase/functions/send-email-graph/index.ts`
- Accepts: `{ to, cc, bcc, subject, body_html, tenant_id, package_id?, stage_instance_id? }`
- Authenticates caller via Bearer token + `getUser()`
- Fetches caller's `oauth_tokens` row (provider = `microsoft`)
- Refreshes token if expired (reuse the established pattern from `sync-outlook-calendar` etc.)
- Calls `POST https://graph.microsoft.com/v1.0/me/sendMail` with the composed message
- Resolves merge fields (same `{{Field}}` and `<<Field>>` logic as `send-composed-email`)
- Logs to `email_send_log` with a `provider` or `channel` indicator for `microsoft_graph`
- Logs to `client_audit_log`
- Returns clear error if no Graph token or insufficient scope (prompts UI to show reconnect)
- Add `[functions.send-email-graph]` to `supabase/config.toml`

**6. `src/components/client/ComposeEmailDialog.tsx`**
- Before sending, check if user has active Microsoft connection via `useOutlookConnectionStatus`
- If connected: invoke `send-email-graph` instead of `send-composed-email`
- If not connected: fall back to existing Mailgun path
- Show small indicator in the dialog footer: "Sending as jane@vivacity.com.au via M365" or "Sending via system relay"
- Preview still uses `send-composed-email` with `dry_run: true` (merge field resolution stays server-side in both paths — Graph function should also support dry_run)

**7. Database Migration**
- Add `provider` column to `email_send_log` (default `'mailgun'`) to distinguish Graph-sent vs Mailgun-sent emails
- Add trigger on `auth.users` insert to auto-link `public.users` by email match

### What Stays on Mailgun (No Changes)
- `send-stage-email` (automated stage workflow emails)
- `send-composed-email` (fallback when no M365 connection)
- `send-invitation-email` (user invitations)
- `send-self-password-reset` (auth)
- `notifyClientPrimaryContact` (automated system notifications)

### Routing Summary

```text
┌─────────────────────────────┐     ┌──────────────────────┐
│ ComposeEmailDialog          │────▶│ Has M365 connection? │
│ (individual CSC → client)   │     └──────────┬───────────┘
└─────────────────────────────┘          yes │       │ no
                                             ▼       ▼
                                    send-email-graph  send-composed-email
                                    (Graph /me/sendMail) (Mailgun)
                                    sender: user's M365  sender: noreply@mg...
```

### Manual Prerequisites
1. Enable Azure provider in Supabase Dashboard → Auth → Providers
2. Add Supabase callback URL as redirect URI in Azure AD app registration
3. Existing M365-connected users will need to disconnect/reconnect for `Mail.Send` consent

### Files Changed
- `src/pages/Login.tsx` — add M365 sign-in button
- `src/lib/microsoft/scopes.ts` — add `Mail.Send`
- `supabase/functions/_shared/microsoft-scopes.ts` — add `Mail.Send`
- `supabase/functions/send-email-graph/index.ts` — new edge function
- `supabase/config.toml` — add function entry
- `src/components/client/ComposeEmailDialog.tsx` — routing logic + sender indicator
- Database migration — `provider` column on `email_send_log` + user-linking trigger

