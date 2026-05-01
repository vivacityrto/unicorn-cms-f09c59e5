# Unify Client Inbox Hub (Revised)

Collapse three side-nav items (Inbox, Communications, Notifications) into a single **Inbox** hub at `/client/inbox` with three tabs: **All / Messages / Notifications**. Old URLs redirect; the topbar bell stays as a quick-peek popover. Frontend-only — no DB, RLS, edge function, or new RPC changes.

## Key corrections vs. prior draft

- **Announcements tab dropped.** No `announcement` value exists in `user_notifications.type` and no announcements table exists. Tabs are 3, not 4.
- **`rpc_get_inbox_items` is never called.** That RPC doesn't exist and has been silently 404'ing. The All tab is built by client-side merging the two working hooks.
- Legacy `?type=announcement` traffic redirects to `?tab=all`.

## Files touched

**Modified**
- `src/components/client/ClientSidebar.tsx` — remove Notifications + Communications nav items
- `src/components/client/ClientTopbar.tsx` — repoint "View all" + per-row fallback to `/client/inbox?tab=notifications`; cap popover list to 5
- `src/pages/ClientInboxPage.tsx` — rebuild as a 3-tab hub
- `src/hooks/useClientInbox.ts` — replace RPC call with client-side merge of `useClientCommunications` + `useClientNotifications`
- `src/App.tsx` — replace the two routes with `<Navigate>` redirects; drop now-unused lazy imports

**Deleted**
- `src/pages/ClientCommunicationsPage.tsx`
- `src/pages/ClientNotifications.tsx`
- `src/pages/client/ClientCommunicationsWrapper.tsx`
- `src/pages/client/ClientNotificationsWrapper.tsx`
- `src/pages/ClientNotificationsWrapper.tsx` (legacy wrapper)

**Preserved (reused inside tabs)**
- `src/hooks/useClientCommunications.ts` — Messages tab + All-tab merge source
- `src/hooks/useClientNotifications.tsx` — Notifications tab + All-tab merge source + bell
- `src/hooks/useNotificationPrefs.ts` — category filtering inside Notifications tab
- `src/components/client/NewConversationDialog.tsx` — New Message dialog
- `src/components/inbox/InboxItemRow.tsx` — All-tab rows (visual source tag)

## Page architecture

`ClientInboxPage.tsx` becomes a controlled-tab container driven by `?tab=` query param.

```text
/client/inbox?tab=<all|messages|notifications>
┌─────────────────────────────────────────────────────────┐
│ Inbox                       [tab-aware action button]   │
│ [ All ] [ Messages ] [ Notifications ]                  │
├─────────────────────────────────────────────────────────┤
│   <tab content>                                         │
└─────────────────────────────────────────────────────────┘
```

**Tab contents**
- **All** — merged feed from rewritten `useClientInbox`. Each row tagged `Message | Notification` via `InboxItemRow`. Newest first.
- **Messages** — full two-pane layout lifted from `ClientCommunicationsPage.tsx`, using `useClientCommunications`.
- **Notifications** — list lifted from `ClientNotifications.tsx` (Today / This Week / Older grouping, dismissable, prefs honoured), using `useClientNotifications`.

**Header action button (right side)**
- Messages tab → `+ New Message` (opens `NewConversationDialog`); hidden when read-only.
- Notifications tab → `Mark all read` (calls `markAllAsRead`); hidden when `unreadCount === 0`.
- All tab → no action button.

**Tab state**
- Initialise from `searchParams.get("tab")`, default `"all"`. Valid: `all | messages | notifications`. Anything else falls back to `all`.
- On tab change, `setSearchParams({ tab })` so URLs stay shareable.
- Legacy `?type=` mapping (used by current InboxPage):
  - `?type=message` → `tab=messages`
  - `?type=announcement` → `tab=all` *(no dedicated tab)*
  - `?type=task` → `tab=all` *(tasks live on `/client/tasks`)*
  - anything else → `tab=all`

## Rewritten `useClientInbox.ts`

No RPC. Compose the two existing hooks and normalise.

```ts
type UnifiedInboxItem = {
  item_type: 'message' | 'notification';
  id: string;
  title: string;
  body: string | null;
  link: string | null;
  created_at: string;
  is_read: boolean;
};

export function useClientInbox() {
  const comms = useClientCommunications();   // { conversations, isLoading, ... }
  const notif = useClientNotifications();    // { notifications, isLoading, ... }

  const items: UnifiedInboxItem[] = useMemo(() => {
    const m = comms.conversations.map(c => ({
      item_type: 'message' as const,
      id: c.id,
      title: c.subject || c.topic || 'General',
      body: c.last_message_preview ?? null,
      link: `/client/inbox?tab=messages&thread=${c.id}`,
      created_at: c.last_message_at ?? c.created_at,
      is_read: !c.isUnread,
    }));
    const n = notif.notifications.map(x => ({
      item_type: 'notification' as const,
      id: x.id,
      title: x.title,
      body: x.message ?? null,
      link: x.link ?? '/client/inbox?tab=notifications',
      created_at: x.created_at,
      is_read: x.is_read,
    }));
    return [...m, ...n].sort(
      (a, b) => +new Date(b.created_at) - +new Date(a.created_at)
    );
  }, [comms.conversations, notif.notifications]);

  return {
    items,
    isLoading: comms.isLoading || notif.isLoading,
    unreadCount: items.filter(i => !i.is_read).length,
  };
}
```

`InboxItemRow` currently expects the full `InboxItem` shape (`inbox_id`, `preview`, `unread`, `due_at`, `status`, `action_required`). Two minimal changes to keep it working with the new merged shape:
- Map unified items into a compatible adapter (`inbox_id=id`, `preview=body`, `unread=!is_read`, `due_at=null`, `status=null`, `action_required=false`, `source_id=id`) when rendering inside the All tab. No edits to `InboxItemRow` itself.
- Existing `TYPE_CONFIG.message` / fallback keeps the visual tag-by-source treatment.

## Routing changes (`src/App.tsx`)

Replace the two existing route elements with `<Navigate>` redirects (preserves bookmarks):

```tsx
<Route path="/client/communications"
  element={<Navigate to="/client/inbox?tab=messages" replace />} />
<Route path="/client/notifications"
  element={<Navigate to="/client/inbox?tab=notifications" replace />} />
```

Drop the now-unused lazy imports for the two deleted wrappers.

## Sidebar (`ClientSidebar.tsx`)

Remove the Notifications + Communications entries. The existing **Inbox** entry is the unified hub. Drop unused icon imports.

## Topbar bell (`ClientTopbar.tsx`)

- "View all" link → `/client/inbox?tab=notifications`.
- Per-row fallback link → `/client/inbox?tab=notifications`.
- Cap displayed list to 5: `filteredClientNotifications.slice(0, 5)`.
- Otherwise unchanged.

## Acceptance verification

- Side nav shows one inbox-related item; Communications and Notifications gone.
- `/client/inbox` loads with **3** tabs: All / Messages / Notifications.
- All tab shows merged messages + notifications, newest first; no `rpc_get_inbox_items` 404 in console.
- `/client/communications` and `/client/notifications` redirect correctly.
- `?type=announcement` resolves to `tab=all`.
- Bell popover look/data unchanged, capped at 5, "View all" routes into the new tab.
- "New Message" appears only on Messages tab; "Mark all read" only on Notifications tab when there are unreads.
- `/client/tasks` and bell unread-count logic untouched.

## Out of scope

DB schema, RLS, edge functions, server-side inbox aggregation RPC (logged as post-launch enhancement), `priority_inbox_actions`, Tasks page.
