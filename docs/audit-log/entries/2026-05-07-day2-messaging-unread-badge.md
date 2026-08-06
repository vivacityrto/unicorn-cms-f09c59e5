# Audit: 2026-05-07 — day2-messaging-unread-badge

**Trigger:** ad-hoc — Day 2 of messaging feature work: accurate unread badge on Communications nav icon + realtime message delivery for CSC side. Continued from 2026-05-06-messaging-rls-cutover.
**Scope:** `TeamCommunicationsPage.tsx`, `DashboardLayout.tsx`, `useTeamUnreadCount.ts` (new hook), `useClientCommunications.ts`, `useClientNotifications.tsx`, `NotificationDropdown.tsx`, `fn_tm_on_message_insert` trigger, `supabase_realtime` publication. Did not touch `help_threads`/`help_messages`, auth, or any non-messaging tables.

## Findings

- `tenant_conversations` and `tenant_messages` were already in `supabase_realtime` with `REPLICA IDENTITY FULL` (confirmed from Day 1). `user_notifications` was absent — the `useNotifications` staff bell subscription was wired correctly in code but the DB never broadcast changes; bell updated only on page reload.
- `fn_tm_on_message_insert` never wrote `source_id` on the `user_notifications` INSERT. `NotificationDropdown` and `handleSelectConversation` both filter mark-as-read by `source_id = conversationId`; without it, the WHERE clause matched nothing and notifications were never cleared programmatically.
- `TeamCommunicationsPage.sendMessage` upserted the sender as a participant with `role='staff'` on conflict — this silently overwrote `role='csc'` for the designated CSC. The `csc` role is the audit-trail mechanism for CSC assignment (documented in 2026-05-06-messaging-rls-cutover); overwriting it loses the record.
- The URL `?thread=X` auto-select `useEffect` ran on every conversation list refresh (realtime triggers a re-render), calling `handleSelectConversation` repeatedly — each call stamped `last_read_at = now()` even when the user had not manually opened the thread. Unread badge reset to 0 on every new incoming message.
- `NotificationDropdown.handleNotifClick` called `markAsRead(notification.id)` before navigating — bell dropped the moment the notification was clicked, not when the conversation was actually opened. UX standard should be: bell clears on conversation open.
- `TeamCommunicationsPage` had no per-conversation unread indicator; staff could not visually distinguish which threads had new messages without scanning the preview text.
- `useClientNotifications` had no realtime subscription — client bell updated only on navigation or reload.
- `useClientCommunications.markRead` updated `conversation_participants.last_read_at` but did not mark the corresponding `user_notifications` row as read — client bell persisted after the client opened the conversation.
- Two new open bugs discovered during smoke testing and parked in `TobeFixedBugs.md` (Bugs 7 and 8). See Open questions parked below.

## KB changes shipped

- No KB changes this session.

## Codebase observations

- unicorn-cms-f09c59e5 @ `de3b6d89`: HEAD at time of audit wrap-up. All changes applied via Lovable across multiple prompts during this session.

## Changes applied via Lovable

**Migration** `20260507034156_4ec5c919-1009-4e01-951b-15f327474fd3.sql`:

- `ALTER PUBLICATION supabase_realtime ADD TABLE public.user_notifications` — idempotent DO block; `user_notifications` now broadcasts INSERT/UPDATE events. Staff bell (`useNotifications`) and client bell (`useClientNotifications`) both subscribe via realtime and update live.
- `CREATE OR REPLACE FUNCTION public.fn_tm_on_message_insert()` — added `source_id = NEW.conversation_id::text` to the `user_notifications` INSERT. This field is required for both `handleSelectConversation` and `markRead` to filter which notifications to mark read when a conversation is opened. `EXCEPTION WHEN OTHERS THEN RAISE WARNING` block preserved — notification failure never blocks message send.

**`TeamCommunicationsPage.tsx`** (multiple prompts):

- `sendMessage` — changed participant upsert to `ignoreDuplicates: true` so only a missing row is inserted; `role='csc'` is never overwritten. `last_read_at` stamped via a separate UPDATE (required `cp_update_own` policy, `user_id = auth.uid()`).
- `handleSelectConversation` — wrapped in `useCallback([currentUserId, qc])`; now also fires a fire-and-forget `user_notifications` UPDATE (`is_read = true WHERE user_id = currentUserId AND source_id = convId AND is_read = false`) then invalidates `["team-unread-count"]`.
- Auto-select `useEffect` — replaced boolean `hasAutoSelected` guard with `lastAutoSelectedRef` (string tracking last auto-selected thread ID) so the effect can handle navigating between different `?thread=` values within the same session without re-stamping the same thread. Now calls `handleSelectConversation(threadId)` instead of `setSelectedId`, so navigation via a notification link correctly stamps `last_read_at` and clears the bell.
- Always-on `team-conversations-live` channel — subscribes to `tenant_conversations` UPDATE events; invalidates `["team-conversations"]` on any incoming message in any thread, keeping the conversation list timestamp/preview live without the user opening a specific thread.
- `["team-conversations"]` queryFn — extended to also fetch `conversation_participants.last_read_at` for current user and compute `isUnread` per conversation. Thread list renders a cyan dot (`#23C0DD`) and bold subject for unread threads.

**`DashboardLayout.tsx`** + **`useTeamUnreadCount.ts`** (new hook):

- New `useTeamUnreadCount` hook: queries `tenant_conversations` × `conversation_participants` for the current user; counts conversations where `last_message_at > last_read_at` or no participant row exists. Subscribes to `team-unread-badge` channel on `tenant_conversations` UPDATE to stay live. `staleTime: 30_000`.
- `DashboardLayout` imports hook, injects `badge: teamUnreadCount` onto the Communications menu item, renders a fuchsia pill (`#ED1878`) when `sidebarOpen && badge > 0`.

**`NotificationDropdown.tsx`**:

- `handleNotifClick` — skips `markAsRead` for `type === 'message'` notifications. Bell now drops when `handleSelectConversation` runs (conversation actually opened), not when the notification item is clicked. The per-notification hover MailOpen button is unchanged and still marks individual notifications read on demand.

**`useClientNotifications.tsx`**:

- Added `useEffect` with realtime INSERT subscription on `user_notifications` filtered by `user_id = profile.user_uuid`. Invalidates `["client-notifications"]` on insert. Channel name `client-notif-live:${userId}`. Cleanup removes channel.

**`useClientCommunications.ts`**:

- `markRead` mutation — added fire-and-forget `user_notifications` UPDATE (`is_read = true WHERE user_id = currentUserId AND source_id = conversationId AND is_read = false`) after the existing `conversation_participants` UPDATE. `onSuccess` also invalidates `["client-notifications"]` so the client bell drops immediately.

## Decisions

- n/a

## Open questions parked

Two bugs discovered during smoke testing. Documented in `TobeFixedBugs.md` as Bugs 7 and 8 (first priority for next session):

- **Bug 7 — CSC does not see new client messages in real-time (requires reload).** The `team-tm:${selectedId}` channel subscribes to `tenant_messages` INSERT events filtered by `conversation_id`. DB confirms `tenant_messages` is in `supabase_realtime` with `REPLICA IDENTITY FULL`. Subscription setup is correct in code. Root cause not yet isolated — candidates: Supabase RLS enforcement on realtime filtered subscriptions for staff, channel-naming collision, or subscription established after the INSERT event fires during initial navigation. Needs dedicated next-session investigation with browser DevTools network tab open.
- **Bug 8 — Client bell and inbox unread tab do not clear when client reads a message from staff.** `markRead` fires `user_notifications UPDATE WHERE source_id = conversationId`. Brian Sismundo's ALL existing notifications have `source_id = null` (pre-migration rows); the WHERE clause matches nothing. Khian Sismundo's post-migration notifications have `source_id` populated and show `is_read = true` in DB. Needs a fresh clean-slate test (send a NEW message after the trigger fix is deployed, then read it) to confirm whether the fix works for new notifications and only legacy null-source_id rows are affected.

## Tag

audit-2026-05-07-day2-messaging-unread-badge
