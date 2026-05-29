## Goal

Add an intermediate landing page at `/activate` so security scanners (link previewers, antivirus URL checkers) don't consume one-time Supabase recovery tokens before the user clicks. Token consumption only happens on explicit button click.

## Changes

### 1. Create `src/pages/ActivateAccount.tsx` (new)

Public route, no auth, no Supabase client calls. Mirrors `ResetPassword.tsx` styling:
- Purple→fuchsia gradient background, unicorn logo, white card
- Reads `token`, `type`, `email` from `useSearchParams`
- If `email` present: heading "You're setting up your password for {email}"
- Single cyan button "Set Up My Password" → on click sets `window.location.href` to:
  `https://yxkgdalkbrriasiyyrwk.supabase.co/auth/v1/verify?token={token}&type={type}&redirect_to={origin}/reset-password`
- If `token` missing: show "This link is invalid. Please contact your administrator." with no button

### 2. `src/App.tsx`

- Add lazy import alongside line 90: `const ActivateAccount = lazy(() => import("./pages/ActivateAccount"));`
- Add `<Route path="/activate" element={<ActivateAccount />} />` next to the `/reset-password` route (~line 269)

### 3. `src/components/profile/AdminActions.tsx`

In `handleCopyRecoveryLink`, after `data.action_link` is returned:
- Parse the Supabase URL, extract `token` and `type` (default `'recovery'`)
- Build `activateUrl = ${origin}/activate?token=...&type=...&email=...` (email URI-encoded)
- Copy `activateUrl` to clipboard instead of the raw Supabase URL
- Update toast description to: `Link for ${data.email} copied to clipboard. Send it directly via Teams or SMS — it opens a landing page before consuming the token. Expires in 1 hour.`

## Out of scope

No changes to `ResetPassword.tsx`, `AcceptInvitationWrapper.tsx`, edge functions, or any other file.
