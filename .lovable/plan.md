## Plan: Add "Copy link" button to ManageInvites Actions column

### Scope
Single file change: `src/pages/ManageInvites.tsx`. No other files touched.

### Changes

1. **Import `Link` icon** from `lucide-react` alongside existing imports.

2. **Add `copyingLinkId` state**:
   ```
   const [copyingLinkId, setCopyingLinkId] = useState<string | null>(null);
   ```

3. **Add `handleCopyLink` async function**:
   - Accept `invite: InviteRow`.
   - Set `copyingLinkId` to `invite.id`.
   - Get current session token via `supabase.auth.getSession()`.
   - Call `supabase.functions.invoke('resend-invite', { body: { invitation_id: invite.id, skip_email: true }, headers: token ? { Authorization: \`Bearer ${token}\` } : undefined })`.
   - If `data?.action_link` exists:
     - Try `navigator.clipboard.writeText(data.action_link)`.
     - On success: toast "Link copied" / "Paste it into Teams, email, or WhatsApp."
     - On clipboard failure: toast "Link ready" / `data.action_link`.
   - If no `action_link` or error: toast "Could not generate link" / `error?.message || "The resend-invite function did not return a link."`, variant "destructive".
   - Finally: clear `copyingLinkId`.

4. **Update Actions cell rendering** (inside the `isSuperAdmin` guard):
   - Condition for showing both buttons: `(invite.status === 'pending' || invite.status === 'sent') && !isVerified`
   - When condition matches, wrap Revoke + Copy link in `<div className="flex items-center gap-2">`.
   - **Copy link button**:
     - `size="sm"`, `variant="ghost"`, `className="text-primary hover:text-primary hover:bg-primary/10"`
     - `disabled={copyingLinkId === invite.id}`
     - Icon: `Link` (or `Loader2` spinner when `copyingLinkId === invite.id`)
     - Label: "Copy link" (or spinner when loading)
   - **Revoke button**: add `disabled={copyingLinkId === invite.id}` so both buttons disable while copying.
   - When condition does not match, keep existing em-dash fallback.

### Constraints preserved
- `isSuperAdmin` guard stays on the entire Actions column.
- Revoke logic, AlertDialogs, Re-invite dialog, Delete dialog, stat cards, filters, search, pagination, realtime subscription, and row data fetching remain untouched.
- Copy link only for `sent`/`pending` + unverified rows.
- No verified, expired, or failed rows get the button.
- Cell width consistency maintained via `flex` wrapper inside existing column bounds.
- No database or migration changes.