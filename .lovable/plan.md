Add unread-thread indicators and fix auto-read timing in `src/pages/TeamCommunicationsPage.tsx`. Single file, no DB changes.

### Changes (src/pages/TeamCommunicationsPage.tsx)

1. **Import**: add `useCallback` to the existing React import.

2. **Wrap `handleSelectConversation` in `useCallback`** with deps `[currentUserId, qc]`. Body unchanged (still does the participant `last_read_at` update, the fire-and-forget `user_notifications` update, and `qc.invalidateQueries(["team-unread-count"])`).

3. **Auto-select effect** (currently lines 97–103): replace `setSelectedId(threadId)` with `handleSelectConversation(threadId)`, and add `handleSelectConversation` to its dependency array. This ensures the unread count drops immediately when a thread is auto-opened from a notification.

4. **Unread indicator on thread list**:
   - Extend `Conversation` interface with `isUnread?: boolean`.
   - In the `["team-conversations"]` queryFn, after building `tenantMap` and before the final `.map(...)`, fetch the current user's `conversation_participants` rows for the loaded conversation IDs (`select conversation_id, last_read_at` filtered by `user_id = currentUserId` and `conversation_id in (...)`). Build a `Map<string, string|null>` of `last_read_at` by conversation id.
   - In the returned mapped object add `isUnread`: true when `c.last_message_at` exists AND (no participant row OR null `last_read_at` OR `last_message_at > last_read_at`); else false.
   - In the thread list `<button>`: when `conv.isUnread`, change the subject `<p>` className from `font-medium` to `font-semibold`, and render `<span className="h-2 w-2 rounded-full bg-[#23C0DD] flex-shrink-0 ml-auto" />` (placed in the existing top row alongside the badge — keep badge as-is, dot rendered conditionally next to it).

### Out of scope / do not touch
- `sendMessage` mutation
- `useTeamUnreadCount` hook
- `DashboardLayout.tsx`
- Any other file
