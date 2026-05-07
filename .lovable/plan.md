## Plan

In `src/components/NotificationDropdown.tsx` (lines 58–59), replace the message-routing branch inside `handleNotifClick` so it falls back to parsing the `conversation` query param from `notification.link` when `source_id` is missing, and navigates to `/communications` (no thread) if neither is available.

### Change

Replace:
```ts
} else if (notification.type === 'message' && notification.source_id) {
  navigate(`/communications?thread=${notification.source_id}`);
}
```

With:
```ts
} else if (notification.type === 'message') {
  const convId = notification.source_id
    ?? new URLSearchParams(notification.link?.split('?')[1] ?? '').get('conversation');
  navigate(convId ? `/communications?thread=${convId}` : '/communications');
}
```

No other files touched.