## Fix: Route message notifications to their thread

In `src/components/NotificationDropdown.tsx` (lines 53–61), update `handleNotifClick` to add a branch for `type === 'message'` notifications. When a message notification has a `source_id`, navigate to `/communications?thread={source_id}` instead of falling through to the generic `notification.link` handler.

Verified `Notification` interface in `src/hooks/useNotifications.tsx` already exposes `source_id: string | null`, so no type changes needed.

### New handler

```ts
const handleNotifClick = (notification: Notification) => {
  if (!notification.is_read) markAsRead(notification.id);

  if (NOTE_TYPES.has(notification.type)) {
    setPreviewNotif(notification);
  } else if (notification.type === 'message' && notification.source_id) {
    navigate(`/communications?thread=${notification.source_id}`);
  } else if (notification.link) {
    navigate(notification.link);
  }
};
```

No other files affected. Backward compatible: existing notification types continue to use `notification.link`.