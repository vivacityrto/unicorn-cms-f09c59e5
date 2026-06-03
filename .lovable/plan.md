## Bug Fix: Re-invite Dialog Calls Wrong Edge Function

### Problem
The Re-invite User modal (`ReInviteDialog.tsx`) currently calls the `invite-user` edge function with only `{ email, tenant_id, role }`. The `invite-user` function requires a full payload (first_name, unicorn_role, invite_as, etc.) and returns 422 when these fields are missing. The modal only provides email + tenant, so it always fails.

The correct function for resending an existing invitation is `resend-invite`, which takes only `{ invitation_id: string }`, refreshes the token and expiry, and re-sends the invitation email automatically.

### Files to Change
1. `src/components/admin/ReInviteDialog.tsx`
2. `src/pages/ManageInvites.tsx` (only the `<ReInviteDialog>` invocation and props)

### Plan

#### 1. Update `ReInviteDialog.tsx` props
Replace `availableEmails` and `availableTenants` with `selectedInvites: InviteRow[]` — the actual selected invitation rows from the parent page. The `InviteRow` type already exists in `ManageInvites.tsx`.

#### 2. Update `ReInviteDialog.tsx` UI
Replace the email and tenant dropdowns with a read-only list of the selected invitations (email, tenant name, role). This is simpler and correctly scoped — the dialog is opened via bulk selection in ManageInvites, so the user has already chosen which invitations to re-send.

#### 3. Update `ReInviteDialog.tsx` submit handler
Iterate over `selectedInvites` and call `resend-invite` for each:
```typescript
for (const invite of selectedInvites) {
  const { data, error } = await supabase.functions.invoke("resend-invite", {
    body: { invitation_id: invite.id },
  });
  if (error) throw error;
}
```
Show a single success toast (e.g. "3 invitation(s) re-sent successfully") when all complete, or an error toast if any fail.

#### 4. Update `ManageInvites.tsx` props passed to `ReInviteDialog`
Pass the selected invite objects directly instead of `availableEmails` / `availableTenants`:
```tsx
<ReInviteDialog
  open={reInviteDialogOpen}
  onOpenChange={setReInviteDialogOpen}
  selectedInvites={filteredInvites.filter(i => selectedInvites.has(i.id))}
/>
```

### What Stays Unchanged
- The separate "Invite User" flow (calls `invite-user` correctly with a full payload)
- The "Copy Link" action (already correctly calls `resend-invite` with `skip_email: true`)
- The "Revoke" action
- The `resend-invite` edge function
- The `invite-user` edge function
- Any other UI or logic in ManageInvites (table, filters, pagination, etc.)

### Acceptance Criteria
- [ ] Clicking "Re-invite" in the bulk action toolbar opens the modal showing the selected invitation(s)
- [ ] Clicking "Re-send Invitation" calls `resend-invite` for each selected invitation
- [ ] No 422 errors from `invite-user` occur during re-invite
- [ ] All other Manage Invites functionality remains identical