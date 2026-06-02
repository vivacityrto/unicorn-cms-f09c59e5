Update five expressions in `src/pages/ManageInvites.tsx` so the stat cards and filter logic correctly use `userStatus.is_in_auth === true` instead of truthy `userStatus` or `email_confirmed_at`.

Changes (exact replacements, no other edits):

1. **stats.verified** (line 392): `return !!userStatus;` → `return !!userStatus && userStatus.is_in_auth === true;`
2. **stats.pending** (line 381): `return !isExpired && !userStatus;` → `return !isExpired && (!userStatus || !userStatus.is_in_auth);`
3. **stats.expired** (line 387): `return isExpired && !userStatus;` → `return isExpired && (!userStatus || !userStatus.is_in_auth);`
4. **matchesStatus verified filter** (line 442): `(statusFilter === "verified" && invite.status === "sent" && userStatuses.get(invite.email)?.email_confirmed_at)` → `(statusFilter === "verified" && userStatuses.get(invite.email)?.is_in_auth === true)`
5. **matchesStatus pending filter** (line 443): `(statusFilter === "pending" && (invite.status === "pending" || (invite.status === "sent" && !userStatuses.get(invite.email)?.email_confirmed_at)))` → `(statusFilter === "pending" && (invite.status === "pending" || invite.status === "sent") && !isExpired && !userStatuses.get(invite.email)?.is_in_auth)`

No other code, files, or behaviour are touched.