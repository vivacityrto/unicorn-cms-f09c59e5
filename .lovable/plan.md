# Fix: Copy Recovery Link burns token before user clicks

## Problem
`src/components/client/TenantUsersTab.tsx` → `handleCopyRecoveryLink()` copies the raw Supabase `action_link` (a one-time `/auth/v1/verify?token=...` URL). Link scanners (Outlook Safe Links, AV previewers) follow it on receipt and consume the token, so the recipient sees "invalid/expired".

`src/components/profile/AdminActions.tsx` already solves this by rewriting the link to `/activate?token=...&type=recovery&email=...`, which is a static landing page that only consumes the token on user click.

## Fix

### 1. New shared helper — `src/lib/recoveryLink.ts`
Single source of truth for the transform so the two buttons can never drift:

```ts
export function buildActivateUrlFromActionLink(actionLink: string, email: string): string {
  const u = new URL(actionLink); // throws on invalid URL — callers handle
  const token = u.searchParams.get('token');
  const type = u.searchParams.get('type') || 'recovery';
  if (!token) throw new Error('Recovery link missing token');
  return `${window.location.origin}/activate?token=${token}&type=${encodeURIComponent(type)}&email=${encodeURIComponent(email)}`;
}
```

### 2. `src/components/client/TenantUsersTab.tsx` (handleCopyRecoveryLink, ~line 303)
- Import the helper.
- Replace `navigator.clipboard.writeText(payload.action_link)` with:
  ```ts
  let activateUrl: string;
  try {
    activateUrl = buildActivateUrlFromActionLink(payload.action_link, payload.email);
  } catch {
    toast.error("Couldn't generate recovery link — please try again");
    return;
  }
  try {
    await navigator.clipboard.writeText(activateUrl);
    toast.success('Recovery link copied');
  } catch {
    toast.message('Copy manually', { description: activateUrl });
  }
  ```
- Keep all surrounding logic intact (single edge-function call, AUTH_USER_NOT_FOUND branch, error mapping, fallback toast).

### 3. `src/components/profile/AdminActions.tsx` (handleCopyRecoveryLink, lines 317–320)
- Import the helper.
- Replace the inline 4-line transform with `const activateUrl = buildActivateUrlFromActionLink(data.action_link, data.email);`
- Behaviour, toasts, and copy text remain identical.

## Out of scope (explicitly NOT touched)
- `generate-recovery-link` edge function — unchanged.
- `/activate` route / `ActivateAccount` page — already consumes token only on user action; relied on by AdminActions today.
- `Send Password Reset` button — unchanged.
- `src/pages/ManageInvites.tsx` and `src/pages/admin/CohortAccessSenderJob.tsx` also copy raw `action_link`s but for **invite** flows (`type=invite`/`signup`), not recovery, and the user scoped the fix to the Users-tab recovery button. Leaving as-is.

## Verification checklist
- TenantUsersTab "Copy Recovery Link" → clipboard now contains `https://<origin>/activate?token=...&type=recovery&email=...`, identical shape to AdminActions output.
- Invalid/missing `action_link` → existing error toast fires; nothing broken is copied.
- `/activate` route in `src/App.tsx:273` resolves to `ActivateAccount`, which already handles `type=recovery` (AdminActions depends on this today — no change).
- Only one `generate-recovery-link` call per click (unchanged).
- No DB, RPC, or edge-function changes.

## Risk assessment
**Low.** Frontend-only string transform extracted into a 6-line helper. The exact transform is already in production via AdminActions, so behaviour parity is guaranteed. Worst case (malformed `action_link`) is caught and surfaces the existing error toast instead of copying a broken value.
