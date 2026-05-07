## Goal
Make message-notification unread counts drop in real time when a user opens a conversation in the Vivacity team inbox.

## Part 1 — Database migration

One migration with two changes:

**A. Add `user_notifications` to the realtime publication** so that `useNotifications` (already subscribed) receives UPDATE events when notifications are marked read.

```sql
ALTER PUBLICATION supabase_realtime ADD TABLE public.user_notifications;
```

(Wrapped in a `DO` block that checks `pg_publication_tables` to make it idempotent — re-running the migration won't error.) No REPLICA IDENTITY change needed; subscribers refetch on any event.

**B. Update `public.fn_tm_on_message_insert`** to populate `source_id` with the conversation id, so the per-conversation read-mark UPDATE in Part 2 can target the right rows. This is a `CREATE OR REPLACE` of the function body only — the existing `trg_tm_on_message_insert` trigger binding stays intact, no downtime. Function body identical to today except the INSERT into `user_notifications` adds `source_id` (column) and `NEW.conversation_id::text` (value); link string unchanged.

## Part 2 — Code change (single file)

`src/pages/TeamCommunicationsPage.tsx` — `handleSelectConversation`:
Between the existing `conversation_participants` UPDATE and the `qc.invalidateQueries({ queryKey: ["team-unread-count"] })`, add a fire-and-forget UPDATE:

```ts
void (supabase
  .from("user_notifications" as any)
  .update({ is_read: true } as any)
  .eq("user_id", currentUserId)
  .eq("source_id", convId)
  .eq("is_read", false) as any).then(() => {}, () => {});
```

No imports change. No other files touched.

## Out of scope
- `useNotifications.tsx`, `NotificationDropdown.tsx`, `useClientNotifications.tsx`, `ClientLayout.tsx`, or any other file.
- No data backfill of `source_id` for historical message notifications (only newly inserted rows after this migration will have it populated; pre-existing message notifications stay as-is).