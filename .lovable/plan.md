## Goal
Make client portal message notifications visible in the topbar bell and Notifications tab, and ensure clicking them opens the correct thread.

## Changes

### 1. `src/hooks/useClientNotifications.tsx`
Add `"message"` as the first entry in the `CLIENT_FACING_TYPES` array so message-type notifications are no longer filtered out of the client notification feed and unread bell count.

### 2. `src/pages/ClientInboxPage.tsx`
The `NotificationsTab` here doesn't use a `to=` prop — it navigates via `handleClick` calling `navigate(n.link)`. Apply the URL rewrite at that point:

- Add a module-level helper:
  ```ts
  function resolveNotificationLink(n: ClientNotification): string {
    if (n.type === 'message' && n.link) {
      try {
        const url = new URL(n.link, window.location.origin);
        const convId = url.searchParams.get('conversation');
        if (convId) return `/client/inbox?tab=messages&thread=${convId}`;
      } catch {}
    }
    return n.link || '/client/inbox?tab=notifications';
  }
  ```
- In `NotificationsTab.handleClick`, replace `if (n.link) navigate(n.link);` with `navigate(resolveNotificationLink(n));`.
- Keep the existing `{n.link && <ExternalLink ... />}` indicator as-is.

## Out of scope
- No DB / trigger changes (`fn_tm_on_message_insert` already inserts the row).
- No edits to the All tab, MessageTab, ClientSidebar, or the team inbox.
- No changes to notification preferences or styling.