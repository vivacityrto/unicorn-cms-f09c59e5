## Objective
Add a "Copy Recovery Link" button inside the existing Password Reset section of `AdminActions.tsx`. This button is only visible to Super Admins and copies a password recovery link to the clipboard via the new `generate-recovery-link` edge function.

## Scope
- **File:** `src/components/profile/AdminActions.tsx`
- **No other files touched.**
- **No existing handlers or UI modified** (e.g. `handleSendPasswordReset`, AlertDialog, Account Status, Role Type, Warning footer, `canManage` guard all remain untouched).

## Implementation Steps

1. **Lucide import** — Add `Copy` to the existing `lucide-react` import block alongside `Key`, `Mail`, etc.

2. **State** — Add `copyingLink` / `setCopyingLink` immediately after the existing `sendingReset` state declaration.

3. **Handler** — Add `handleCopyRecoveryLink` immediately after `handleSendPasswordReset`. It will:
   - Invoke `generate-recovery-link` via `supabase.functions.invoke` with `{ user_uuid: user.user_uuid }`.
   - Validate `data.ok`, throw on edge-function or network errors.
   - Copy `data.action_link` to `navigator.clipboard`.
   - Show a success `toast` with a warning not to email the link.
   - Show an error `toast` on failure.
   - Always reset `copyingLink` in `finally`.

4. **Button** — Insert a new `Button` inside the existing `div.p-3.rounded-lg.bg-background.border` (Password Reset section), directly below the existing AlertDialog. Render conditionally with `{isSuperAdmin && ...}`.
   - `variant="outline"`, `size="sm"`, `className="w-full"`.
   - Show `Loader2` + "Generating..." while `copyingLink` is true.
   - Show `Copy` icon + "Copy Recovery Link" otherwise.

## Success Criteria
- Super Admin sees "Copy Recovery Link" button in Password Reset section.
- Non-Super Admin does not see the button.
- Clicking it generates a recovery link, copies to clipboard, and shows a success toast with expiry warning.
- Errors surface via toast without breaking the UI.