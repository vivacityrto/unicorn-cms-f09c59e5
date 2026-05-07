In `src/hooks/useClientInbox.ts` (line 36), add a `.filter((n) => n.type !== 'message')` between `(notif.notifications || [])` and `.map((n) => ({` to exclude message-type notifications from the "All" tab aggregation (they already appear as conversation entries). The Notifications tab continues to show them via `useClientNotifications` directly.

No other changes.
