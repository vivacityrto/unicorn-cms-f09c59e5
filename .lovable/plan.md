# Add password reset & recovery link actions to Team Members menu

## File to change (only one)

`src/components/client/TenantUsersTab.tsx` — this renders the Tenant detail "Users" tab and the per-row ⋮ menu (verified: `DropdownMenu` at lines 703–727, uses `MoreVertical`, already gated by `canManageUsers`).

No other file is touched. No new context, no new client, no new toast lib — `toast` from sonner and `supabase` from `@/integrations/supabase/client` are already imported in this file; `useAuth`/`useRBAC` are already used (`isSuperAdmin`, `isVivacityTeam`, `profile`, etc.) so Super-Admin gating uses existing state.

## Menu additions (inside the existing `<DropdownMenuContent>`)

Order in the menu after "Edit User", before the destructive "Remove from tenant" separator:

1. `Send Password Reset` — visible to all callers who already pass `canManageUsers` (SuperAdmin or tenant Admin); the edge function itself re-checks authority.
2. `Copy Recovery Link` — rendered **only when `isSuperAdmin()` is true**, matching the edge function's super-admin-only contract.

Both items: icon from `lucide-react` (`KeyRound` for reset, `Link2` for recovery — both already common in this codebase), `disabled` while the row's call is in flight, no `onSelect` default-close interference.

## Local state

Add a single `actionUserId: string | null` (the `user_id` of the row currently being acted on) plus an `actionKind: 'reset' | 'recovery' | null` so we can disable just the relevant item. Reuse existing toast pattern (`toast.success` / `toast.error` / `toast.info`).

## Handlers

```text
handleSendPasswordReset(member):
  set in-flight
  { data, error } = supabase.functions.invoke('send-password-reset',
                       { body: { user_uuid: member.user_id } })
  network/error → toast.error('Could not send password reset')
  data.ok       → toast.success(`Password reset email sent to ${data.email}`)
  data.ok===false → map data.code (see below)
  finally clear in-flight

handleCopyRecoveryLink(member):
  guard isSuperAdmin(); set in-flight
  invoke('generate-recovery-link', { body: { user_uuid: member.user_id } })
  on ok:true → navigator.clipboard.writeText(data.action_link)
               toast.success('Recovery link copied')
  on ok:false → map data.code
  finally clear in-flight
```

The frontend never constructs a URL. `action_link` is used verbatim from the response.

## Error code → message map

- `AUTH_USER_NOT_FOUND` → `toast.info("This user hasn't activated their account yet — use Activate account instead")` (the existing "Activate account" button already shows for ghosts to Vivacity staff at line 679).
- `INSUFFICIENT_PERMISSIONS` → "You don't have permission to do that."
- `CROSS_TENANT_NOT_ALLOWED` → "This user isn't part of this tenant."
- `USER_NOT_FOUND` → "User record not found."
- `MAILGUN_NOT_CONFIGURED` → "Email service isn't configured — contact support."
- `LINK_GENERATION_FAILED` → "Could not generate the link — try again."
- Anything else / network error → generic "Something went wrong — try again."

Australian English throughout ("Authorised", "couldn't", etc.).

## Super-Admin gating

`isSuperAdmin()` is already destructured from `useAuth()` in this file (used on line 130 for `canActivateGhosts`). The "Copy Recovery Link" `<DropdownMenuItem>` is wrapped in `{isSuperAdmin() && (...)}` so tenant Admins never see it. No new RBAC plumbing.

## Ghost user surfacing

When `send-password-reset` returns `AUTH_USER_NOT_FOUND`, we already know it's a ghost. The toast directs the staff member to the "Activate account" inline button that this same file renders to Vivacity staff (line 684) — no extra UI needed. For tenant Admins (who can't see Activate), the same toast text tells them what's happening; they'll contact Vivacity.

## What could go wrong

- **Clipboard API blocked** (insecure context / permission denied): wrap `navigator.clipboard.writeText` in try/catch; on failure show the link in a toast with a "copy manually" hint rather than silently succeeding.
- **Double-click race**: prevented by per-row `actionUserId + actionKind` disabling the item while in flight.
- **Stale session / 401 from invoke**: caught by the generic error branch; toast asks user to refresh.
- **Tenant Admin clicking Reset for a user from another tenant** (shouldn't be visible but defence-in-depth): edge function returns `CROSS_TENANT_NOT_ALLOWED`, mapped to a clear message.
- **Ghost user**: handled explicitly via `AUTH_USER_NOT_FOUND` toast — never shows a generic failure.
- **Menu close-on-select swallowing the spinner**: items will be plain `<DropdownMenuItem>`; the toast confirms outcome after the menu closes, which is the existing pattern used by "Activate account".

## Out of scope (explicitly)

- No edge function changes or new functions.
- No URL construction in the frontend.
- No rename of `user_uuid`, no new tenant scoping, no new provider.
