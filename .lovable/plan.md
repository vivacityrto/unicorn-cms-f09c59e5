Fix `src/pages/ManageInvites.tsx` — all changes confined to this one file.

**Root cause**
`supabase.auth.admin.listUsers()` on line 180 requires the service role key and cannot be called from the frontend with a user JWT. It silently fails, so `authUserMap` is always empty and `is_in_auth` is always false. This breaks Verified counts (shows 0), Expired counts (shows accepted users), and row badges (Verified never appears).

The correct signal is already on the invitation: `invite.status === 'accepted'`.

**Changes**

1. **Remove the `auth.admin.listUsers()` block (lines 178–190)**
   Delete the entire `authUserMap` try/catch block. Update the `statusMap` builder so `last_sign_in_at: null` and `is_in_auth: false` (placeholder — the field is no longer used for logic but stays in the type to avoid TS errors elsewhere).

2. **Replace `isVerified` (~line 807)**
   Old: `const isVerified = !!userStatus && userStatus.is_in_auth === true;`
   New: `const isVerified = invite.status === 'accepted';`

3. **Fix `stats.verified`**
   Old: `return !!userStatus && userStatus.is_in_auth === true;`
   New: `return i.status === 'accepted';`

4. **Fix `stats.pending`**
   Old: `return !isExpired && (!userStatus || !userStatus.is_in_auth);`
   New: `return !isExpired && i.status !== 'accepted';`

5. **Fix `stats.expired`**
   Old: `return isExpired && (!userStatus || !userStatus.is_in_auth);`
   New: `return isExpired && i.status !== 'accepted';`

6. **Fix `matchesStatus` verified filter**
   Old: `(statusFilter === "verified" && userStatuses.get(invite.email)?.is_in_auth === true)`
   New: `(statusFilter === "verified" && invite.status === 'accepted')`

7. **Fix `matchesStatus` pending filter**
   Old: `... && !userStatuses.get(invite.email)?.is_in_auth`
   New: `... && invite.status !== 'accepted'`

8. **Fix `matchesStatus` expired filter**
   Old: `(statusFilter === "expired" && (invite.status === "expired" || isExpired))`
   New: `(statusFilter === "expired" && (invite.status === "expired" || isExpired) && invite.status !== 'accepted')`

**Do not change**
- `UserStatus` type definition (keep `is_in_auth` to avoid TypeScript errors elsewhere)
- `canActOnInvite`, `canRevoke`, `canCopyLink` (these use `!isVerified`, which will now correctly derive from `invite.status === 'accepted'`)
- Any other filter conditions, row rendering, realtime subscription, fetch logic, dialogs, pagination, or any other file