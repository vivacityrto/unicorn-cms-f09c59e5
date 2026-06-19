## Plan: Wire up Create & Invite, Revoke Access, and Link Unicorn User on the engagement detail page

Single file edited: `src/pages/admin/StaffEngagementDetail.tsx`. No other files touched.

### 1. New imports
- Add `Dialog`, `DialogContent`, `DialogHeader`, `DialogTitle`, `DialogFooter` from `@/components/ui/dialog`.
- Add `Input` from `@/components/ui/input`.
- Add `Label` from `@/components/ui/label`.
- Add `Select`, `SelectContent`, `SelectItem`, `SelectTrigger`, `SelectValue` from `@/components/ui/select`.

### 2. New state (alongside `confirmCancel`)
- `inviteDialogOpen` (bool, default false)
- `inviteRole` (string, default `"Team Member"`)
- `confirmRevoke` (bool, default false)
- `linkUserOpen` (bool, default false)
- `linkSearch` (string, default `""`)

### 3. New `userSearchQuery` (after `userNamesQuery`)
- Key: `["vivacity_user_search", linkSearch]`, enabled when `linkSearch.length >= 2`.
- Query `users` with `select("user_uuid, full_name")`, `eq("is_vivacity_internal", true)`, `ilike("full_name", "%<search>%")`, `limit(8)`.

### 4. Three new mutations (after `signoffMutation`)

**`inviteMutation`** — `{ role }`:
- `supabase.functions.invoke('invite-user', { body: { email: engagement.person_email, role, invite_as: 'VIVACITY' } })`.
- Throw if `res.error` or `res.data?.ok !== true` (use `res.data?.detail ?? 'Invite failed'`).
- Get authed user, insert into `checklist_item_completions` with `item_key: 'access.unicorn_provisioned'`.
- onSuccess: toast "Invite sent", close dialog, invalidate `checklist_completions`, `checklist_activity`, `staff_engagement`, `staff_engagements`.
- onError: destructive toast.

**`revokeMutation`** — no input:
- `supabase.from("users").update({ disabled: true }).eq("user_uuid", engagement.linked_unicorn_user_id)`.
- Get authed user, insert `checklist_item_completions` with `item_key: 'access_revoke.unicorn'`.
- onSuccess: toast "Access revoked", close confirm, invalidate same 4 queries.
- onError: destructive toast.

**`linkUserMutation`** — `{ userUuid }`:
- `supabase.from("staff_engagements").update({ linked_unicorn_user_id: userUuid }).eq("id", id)`.
- onSuccess: toast "User linked", close dialog, clear search, invalidate `staff_engagement`, `staff_engagements`.
- onError: destructive toast.

### 5. Manage dropdown — two new items after Cancel
- If `!engagement.linked_unicorn_user_id`: "Link Unicorn User" → opens link dialog.
- Else: "Unlink User" → inline updates `linked_unicorn_user_id` to null, invalidates both engagement queries, toasts "User unlinked".

### 6. Custom checklist item rendering
Inside the existing `section.items.map(...)` body in the non-signoff branch, branch on `item.key` before the default `<Checkbox>` row:

- **`access.unicorn_provisioned`**: render the special row (check icon or spacer instead of checkbox, label, owner, "Create & Invite" outline button when not checked) — opens `inviteDialogOpen`.
- **`access_revoke.unicorn`**: same shape with destructive "Revoke Access" button when not checked; if `linked_unicorn_user_id` is null, button is disabled and wrapped in a Tooltip "Link a Unicorn user first".

Default row stays unchanged for all other items.

### 7. Three new dialogs (before closing `</DashboardLayout>`, after existing AlertDialog)

- **Create & Invite Dialog**: read-only email field showing `engagement.person_email`, Select bound to `inviteRole` with options Super Admin / Team Member / CSC / Integrator / BGT. Footer: Cancel + "Send Invite" (disabled while pending) → `inviteMutation.mutate({ role: inviteRole })`.
- **Revoke AlertDialog**: title "Revoke Unicorn access?", description naming `engagement.person_name`. Footer: Cancel + destructive "Revoke Access" → `revokeMutation.mutate()`.
- **Link User Dialog**: search Input bound to `linkSearch`; below it list buttons of `userSearchQuery.data` results showing `full_name`; clicking calls `linkUserMutation.mutate({ userUuid })`. Show "No results" when `linkSearch.length >= 2` and zero results.

### Out of scope (untouched)
All other checklist items, sign-off panel, cancel mutation, PhaseProgress, all other tabs, all other files.
