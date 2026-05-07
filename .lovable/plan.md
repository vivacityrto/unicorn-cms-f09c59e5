## Plan

Three scoped fixes across two existing files plus one new hook. No other files touched.

### 1. `src/pages/TeamCommunicationsPage.tsx` — Realtime conversation list
Add a second, independent `useEffect` directly below the existing `selectedId`-scoped realtime subscription. New effect subscribes to `tenant_conversations` UPDATE events on channel `team-conversations-live` (no `selectedId` guard) and invalidates `["team-conversations"]` on any update. Existing subscription left untouched.

### 2. `src/pages/TeamCommunicationsPage.tsx` — Mark-as-read without overwriting role
- In `sendMessage` (~lines 207–215), replace the single participant upsert with two steps:
  1. Upsert with `role: "staff"` and `last_read_at`, using `onConflict: "conversation_id,user_id", ignoreDuplicates: true` (never overwrites existing role).
  2. Update `last_read_at` on the existing row by `conversation_id` + `user_id`.
- Add a `handleSelectConversation(convId)` helper that calls `setSelectedId`, then updates `last_read_at` on `conversation_participants` for the current user, then invalidates `["team-unread-count"]`.
- In the thread list `filtered.map` (~line 299), replace `onClick={() => setSelectedId(conv.id)}` with `onClick={() => handleSelectConversation(conv.id)}`.

### 3. Unread badge on Communications nav

**New file `src/hooks/useTeamUnreadCount.ts`**: exports `useTeamUnreadCount()` returning a number. Loads current user, subscribes to `tenant_conversations` UPDATEs to invalidate, and runs a `useQuery(["team-unread-count", currentUserId])` that fetches all `tenant_conversations` with `last_message_at`, then `conversation_participants` rows for the user, then counts conversations whose `last_message_at` > stored `last_read_at` (or no participant row / null read).

**Edit `src/components/DashboardLayout.tsx`**:
- Import `useTeamUnreadCount`.
- Call `const teamUnreadCount = useTeamUnreadCount();` after existing hooks.
- Extend `renderMenuItem` parameter type to include optional `badge?: number`. In both the Vivacity-team branch and the client branch, after the label `<span>` inside `<Link>`, render a pink (`bg-[#ED1878]`) pill showing `badge` (capped to `99+`) when `sidebarOpen && badge > 0`.
- Replace the `renderSection("clients", "Clients", clientsMenuItems, "clients")` call with a mapped variant that injects `badge: teamUnreadCount || undefined` onto the item whose `path === "/communications"`. `renderSection` signature unchanged.

### Out of scope
No changes to `useClientCommunications.ts`, `ClientInboxPage.tsx`, `useClientInbox.ts`, `ClientSidebar.tsx`, `MessageTab.tsx`, isolation tests, or any EOS/Administration code. No DB/RLS/migration changes.
