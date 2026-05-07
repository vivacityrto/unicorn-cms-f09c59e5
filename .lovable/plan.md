# Fix: Staff thread not updating in realtime

## Problem
In `TeamCommunicationsPage.tsx`, the `team-tm:${selectedId}` channel subscribes to `tenant_messages` INSERTs with a `conversation_id` filter. With RLS using custom security-definer functions, filtered `postgres_changes` events on `tenant_messages` are not delivered reliably to staff, so the open thread does not refresh until a manual reload.

A reliable signal already exists: the `fn_tm_on_message_insert` trigger updates `tenant_conversations.last_message_at` on every message insert. The `team-conversations-live` subscription already receives those UPDATE events — it just doesn't refresh the open thread.

## Change (single file)

**`src/pages/TeamCommunicationsPage.tsx`** — lines 211–229 only.

Modify the `team-conversations-live` effect to also invalidate the open thread when the updated conversation is the selected one:

```ts
useEffect(() => {
  const channel = supabase
    .channel("team-conversations-live")
    .on(
      "postgres_changes" as any,
      {
        event: "UPDATE",
        schema: "public",
        table: "tenant_conversations",
      },
      (payload: any) => {
        qc.invalidateQueries({ queryKey: ["team-conversations"] });
        if (selectedId && payload.new?.id === selectedId) {
          qc.invalidateQueries({ queryKey: ["team-conversation-messages", selectedId] });
        }
      }
    )
    .subscribe();
  return () => {
    supabase.removeChannel(channel);
  };
}, [qc, selectedId]);
```

## Explicitly NOT changing
- The existing `team-tm:${selectedId}` effect (lines 186–208) stays — harmless redundancy; if Supabase ever delivers it, it just triggers an idempotent invalidation.
- `handleSelectConversation` (last_read_at stamping + notification clearing) — untouched.
- `sendMessage` mutation (already invalidates both keys) — untouched.
- No RLS, trigger, migration, schema, or client-portal changes.

## Why this works (technical notes)
- `tenant_conversations` has REPLICA IDENTITY FULL, so `payload.new` is fully populated on UPDATE — the `payload.new?.id === selectedId` check is safe.
- The trigger `fn_tm_on_message_insert` runs SECURITY DEFINER and updates `last_message_at`, guaranteeing one UPDATE per message insert.
- The unfiltered UPDATE subscription on `tenant_conversations` is already proven to deliver (the conversation list refresh works today).
- Adding `selectedId` to deps re-subscribes when the user opens a different thread, so the closure always sees the current selection.

## Edge cases
- `selectedId === null` → guard prevents extra invalidation.
- Rapid thread switches → effect cleanup removes the channel; no leaks.
- Multiple tabs / multiple staff → each receives the UPDATE; React Query dedupes refetches.
- Sender's own message → mutation `onSuccess` already invalidates; the realtime invalidation is a harmless second refresh.
- Conversation UPDATEs unrelated to new messages (e.g. participant changes) → still triggers a thread refetch only if it's the open thread; cost is one cached query refetch, no UX impact.

## Risk assessment
- **Backward compatibility:** Additive only; no removed behaviour. Conversation list refresh path unchanged.
- **Access control:** No RLS changes. The thread query (`team-conversation-messages`) already enforces RLS on refetch — invalidation cannot leak data.
- **Audit trail:** No write paths touched; trigger and audit logging unaffected.
- **Performance:** One extra `invalidateQueries` per conversation UPDATE when that thread is open. Bounded and cheap.
- **Client portal:** Untouched.

## Summary of benefits
- Staff see new client messages live in the open thread, no reload required.
- Uses an already-working realtime path; avoids fighting Supabase Realtime + filtered RLS edge cases.
- Single, isolated, reversible change in one file.
