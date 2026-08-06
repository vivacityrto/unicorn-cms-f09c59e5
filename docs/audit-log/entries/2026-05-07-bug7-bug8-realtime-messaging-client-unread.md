# Audit: 2026-05-07 — bug7-bug8-realtime-messaging-client-unread

**Trigger:** ad-hoc — Bugs 7 and 8 from `TobeFixedBugs.md`, both flagged first-priority at end of Day 2 session (`audit-2026-05-07-day2-messaging-unread-badge`). Continued from that session.
**Scope:** `TeamCommunicationsPage.tsx`, `useClientCommunications.ts`, `ClientInboxPage.tsx`, migration `20260507051924`. Did not touch auth, help threads, any non-messaging tables, or RLS policies.

## Findings

**Bug 7 — CSC does not see new client messages in real-time (requires page reload)**

- Root cause isolated via browser DevTools WS inspection: the `team-tm:${selectedId}` Supabase Realtime channel subscribed to `tenant_messages` INSERT events with a `conversation_id=eq.${selectedId}` filter. Supabase Realtime filtered subscriptions do not work correctly when the underlying RLS policy uses a custom security-definer function (`is_vivacity_team_safe`). The event is never delivered to the client even though the INSERT fires and the table is in `supabase_realtime` with `REPLICA IDENTITY FULL`.
- The `fn_tm_on_message_insert` trigger already fires a `tenant_conversations` UPDATE (stamps `last_message_at`) on every message INSERT. The `team-conversations-live` channel subscribing to `tenant_conversations` UPDATE events was already confirmed working (no custom-function RLS dependency on that path). This existing path was used as the relay.
- Fix: removed the broken filtered `tenant_messages` INSERT subscription. Extended the always-on `team-conversations-live` `tenant_conversations` UPDATE handler to accept the payload and conditionally call `qc.invalidateQueries(["team-conversation-messages", selectedId])` when `payload.new?.id === selectedId`. This delivers messages live without a page reload.

**Bug 8 — Client bell and inbox unread tab do not clear when client reads a message from staff**

Three distinct root causes, all fixed in one Lovable prompt:

1. **`source_id` null on pre-migration notifications** — `markRead` in `useClientCommunications.ts` fires a fire-and-forget `user_notifications UPDATE WHERE source_id = conversationId`. All notifications created before migration `20260507034156` (Day 2) had `source_id = null`; the WHERE clause matched nothing. 41 rows affected. Fixed by migration `20260507051924`: backfills `source_id` from the `link` column via PostgreSQL regex `substring(link FROM 'conversation=([a-f0-9\\-]+)')` for all rows where `source_id IS NULL AND type = 'message' AND link LIKE '%conversation=%'`.

2. **`useConversationRealtime` subscribed to `tenant_messages` INSERT** — same filtered-subscription RLS issue as Bug 7. The client-side realtime hook never fired, so opening a conversation did not trigger a query invalidation and `isUnread` stayed true in the cache. Fixed by replacing the broken subscription with a `tenant_conversations` UPDATE channel (`conv-live:${conversationId}`), conditionally invalidating `["conversation-messages", conversationId]` and `["client-conversations"]` when `payload.new?.id === conversationId`.

3. **No auto mark-read on deep-link / URL-param selection** — `handleSelect` in `ClientInboxPage.tsx` called `markRead.mutate` on click, but when the client navigated directly to `/client/inbox?tab=messages&thread=X` (e.g., via a notification link), `handleSelect` was never invoked. The thread opened but was never marked read. Fixed by adding a `useEffect` watching `[selectedId, conversations]` that calls `markRead.mutate(selectedId)` if `conv.isUnread`.

**Regression introduced by Bug 8 Fix A and resolved immediately**

- The initial fix included `markRead` (the full `useMutation` object) in the `useEffect` dependency array. `useMutation` returns a new object reference on every state transition (`idle → pending → success → idle`). Because `conv.isUnread` does not flip to `false` until the `conversations` query refetches and the cache updates, the effect re-fired on each state change, calling `markRead.mutate` again before the cache settled. This produced a tight loop of rapid PATCH requests against `conversation_participants`, saturated React Query's mutation queue, and starved `sendMessage.mutateAsync` of a render slot — client messages appeared to send but never reached the DB.
- Diagnosed from API network logs: zero POST to `tenant_messages`, dozens of rapid PATCH to `conversation_participants` per second.
- Fix: extracted `const mutateMarkRead = markRead.mutate` (stable bound reference; React Query guarantees referential stability of `.mutate`). Used `mutateMarkRead` in the dep array instead of `markRead`. Loop eliminated; message sending restored.

**Bug 6 (URL not updated after new conversation) — fixed as part of Bug 8 combined prompt**

- `handleSelectConversation` in `TeamCommunicationsPage.tsx` was calling `setSelectedId(id)` on new conversation creation but not updating the URL. Added `setSearchParams({ thread: convId }, { replace: true })` to `handleSelectConversation` and to the `onCreated` callback on `NewTeamMessageDialog`. URL now reflects the selected thread on both click and creation.

## KB changes shipped

- n/a

## Codebase observations

- unicorn-cms-f09c59e5 @ `b7414c3e`: Bug 8 initial fix — migration `20260507051924` (source_id backfill), `useClientCommunications.ts` (`useConversationRealtime` replaced), `ClientInboxPage.tsx` (auto mark-read effect added).
- unicorn-cms-f09c59e5 @ `f1aada3d`: Bug 6 + Bug 8 Fix A + Fix B combined — `TeamCommunicationsPage.tsx` (`setSearchParams` added to handleSelectConversation and onCreated), `ClientInboxPage.tsx` (mark-read effect with broken `markRead` dep — caused regression).
- unicorn-cms-f09c59e5 @ `e5e63941`: Bug 7 fix complete — `TeamCommunicationsPage.tsx` `team-conversations-live` handler extended with `payload` arg and conditional `["team-conversation-messages", selectedId]` invalidation. Belt-and-suspenders routing via `tenant_conversations` UPDATE instead of broken filtered `tenant_messages` INSERT.
- unicorn-cms-f09c59e5 @ `3828190d`: Regression fix — `ClientInboxPage.tsx` extracted `const mutateMarkRead = markRead.mutate`; dep array changed from `[selectedId, conversations, markRead]` to `[selectedId, conversations, mutateMarkRead]`.
- Carl added `isMine` staff filter feature (`e7979647`) between regression detection and regression fix. Only `TeamCommunicationsPage.tsx` changed; no overlap with regression fix target `ClientInboxPage.tsx`.

## Changes applied via Lovable

**Migration `20260507051924_3f482bc8-ba7d-4114-b58e-292634b5ac55.sql`** (Bug 8 root cause 1):
- Backfill: `UPDATE public.user_notifications SET source_id = substring(link FROM 'conversation=([a-f0-9\\-]+)') WHERE source_id IS NULL AND type = 'message' AND link LIKE '%conversation=%'` — updated 41 rows. No schema change; data-only fix.

**`useClientCommunications.ts`** (Bug 8 root cause 2):
- `useConversationRealtime` — replaced broken `tenant_messages` INSERT filtered subscription with `tenant_conversations` UPDATE subscription (`conv-live:${conversationId}`). Conditionally invalidates `["conversation-messages", conversationId]` when `payload.new?.id === conversationId`; unconditionally invalidates `["client-conversations"]` to keep unread state fresh.

**`ClientInboxPage.tsx`** (Bug 8 root causes 2 + 3; regression):
- Added `useEffect([selectedId, conversations, mutateMarkRead])` in `MessagesTab` — auto mark-read on deep-link / URL-param selection. Uses `const mutateMarkRead = markRead.mutate` (stable ref) to avoid mutation-state re-fire loop.
- `handleSelect` unchanged — continues to call `markRead.mutate(conv.id)` directly on click.

**`TeamCommunicationsPage.tsx`** (Bug 7 + Bug 6):
- `team-conversations-live` useEffect — handler now accepts `payload: any`; added `selectedId` to deps; conditionally calls `qc.invalidateQueries(["team-conversation-messages", selectedId])` when `payload.new?.id === selectedId`. No longer subscribes to `tenant_messages` INSERT.
- `handleSelectConversation` — added `setSearchParams({ thread: convId }, { replace: true })` (Bug 6).
- `onCreated` callback on `NewTeamMessageDialog` — added `setSearchParams({ thread: id }, { replace: true })` (Bug 6).

## Decisions

- Routing Bug 7 realtime through `tenant_conversations` UPDATE rather than `tenant_messages` INSERT accepted as the canonical approach for staff-side message delivery. Reason: Supabase Realtime filtered subscriptions are incompatible with custom security-definer RLS functions; `tenant_conversations` UPDATE path has no such dependency and was already confirmed working.
- Regression fix prioritised immediately rather than shipping a workaround, to avoid data integrity risk from the PATCH storm against `conversation_participants`.

## Open questions parked

- Bug 2 (three duplicate dedupe indexes on `user_notifications`) remains open. No migration written. Low urgency — write-overhead tax only, no data risk at current row count (~800 rows). Flag when `user_notifications` is next touched.
- ~~Smoke test for Bug 7 and Bug 8 end-to-end (deep-link path, bell clears, unread indicator clears) to be run at session start of next messaging session.~~ **Closed 8 May 2026** — both bugs confirmed working in production. See `audit-2026-05-08-dashboard-bugs-9-10-11-fix`.

## Tag

audit-2026-05-07-bug7-bug8-realtime-messaging-client-unread
