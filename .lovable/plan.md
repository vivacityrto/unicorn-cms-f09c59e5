Three small changes so message-type notifications clear properly via conversation open (not on dropdown click), and the client bell updates live.

### Change 1: src/components/NotificationDropdown.tsx
In `handleNotifClick` (line 54), change:
```ts
if (!notification.is_read) markAsRead(notification.id);
```
to:
```ts
if (!notification.is_read && notification.type !== 'message') markAsRead(notification.id);
```
Leave the hover MailOpen button (line 199) unchanged.

### Change 2: src/hooks/useClientCommunications.ts
In the `markRead` mutation:
- After the existing `conversation_participants` UPDATE in `mutationFn`, add a fire-and-forget UPDATE to `user_notifications` setting `is_read=true` for `user_id=currentUserId`, `source_id=conversationId`, `is_read=false`.
- In `onSuccess`, also invalidate `["client-notifications"]`.

### Change 3: src/hooks/useClientNotifications.tsx
- Ensure `useEffect` is imported from React.
- After the `useQuery` block, add a realtime subscription on `user_notifications` filtered by `user_id=eq.${profile.user_uuid}` (event INSERT) that invalidates `["client-notifications"]`. Cleanup removes the channel. Deps: `[profile?.user_uuid, qc]`.

### Out of scope
- TeamCommunicationsPage.tsx, ClientTopbar.tsx, ClientInboxPage.tsx, ClientLayout.tsx, any other file.
