## Plan: Add Hard Delete for Super Admins on Engagement Detail Page

### Scope
Only `src/pages/admin/StaffEngagementDetail.tsx` — checklist, sign-off, other mutations, and other files are untouched.

### Changes

1. **New state variable** — Add `const [confirmDelete, setConfirmDelete] = useState(false);` alongside existing state hooks.

2. **New `deleteMutation`** — Add a `useMutation` that:
   - Calls `supabase.from("staff_engagements").delete().eq("id", id!)`
   - On success: shows a toast, invalidates `staff_engagements` query cache, and navigates to `/admin/staff-engagements`
   - On error: shows a destructive toast with the error message

3. **Manage dropdown — add Delete item** — After the existing Unlink User item, insert a new `DropdownMenuItem` that:
   - Only renders when `role === "Super Admin"`
   - Uses `text-destructive` styling
   - Opens the confirmation dialog via `setConfirmDelete(true)`

4. **New confirmation AlertDialog** — Place before the closing `</DashboardLayout>` tag. The dialog:
   - Is controlled by `confirmDelete` state
   - Displays a title "Permanently delete this engagement?"
   - Shows a description including the engagement's first and last name
   - Has a Cancel button and a destructive "Delete Permanently" action button
   - Disables both buttons while `deleteMutation.isPending` is true
   - Calls `deleteMutation.mutate()` on confirm
