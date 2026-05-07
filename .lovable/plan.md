## Fix: Client bell + unread indicator not clearing when opening a conversation

Three coordinated changes — one DB migration and two surgical TS edits — applied exactly as specified. Mirrors the staff-side Bug 7 fix pattern (proven reliable) and patches the data and UI gaps that prevent `markRead` from completing end-to-end.

### Change 1 — DB migration: backfill `user_notifications.source_id`

```sql
UPDATE public.user_notifications
SET source_id = substring(link FROM 'conversation=([a-f0-9\-]+)')
WHERE source_id IS NULL
  AND type = 'message'
  AND link LIKE '%conversation=%';
```

- Targets only legacy `type = 'message'` rows where `source_id IS NULL` and `link` carries `?conversation=<uuid>`.
- `source_id` is a nullable text column with no CHECK / FK / triggers — backfill is safe.
- After this runs, `markRead`'s existing `.eq("source_id", conversationId)` clause matches the legacy 41 rows.
- Idempotent: re-running the migration is a no-op once source_id is populated.
- No RLS changes; UPDATE runs with elevated migration role.
- Audit impact: pure data normalisation — no behavioural change to triggers or notification emitters going forward (new rows already get `source_id` set by the emitter).

### Change 2 — `src/hooks/useClientCommunications.ts` (lines 39–63)

Replace `useConversationRealtime` to subscribe to `tenant_conversations` UPDATE events instead of filtered `tenant_messages` INSERTs. Same proven pattern used in `TeamCommunicationsPage` Bug 7 fix.

```ts
export function useConversationRealtime(conversationId: string | null) {
  const qc = useQueryClient();
  useEffect(() => {
    if (!conversationId) return;
    const channel = supabase
      .channel(`conv-live:${conversationId}`)
      .on(
        "postgres_changes" as any,
        { event: "UPDATE", schema: "public", table: "tenant_conversations" },
        (payload: any) => {
          if (payload.new?.id === conversationId) {
            qc.invalidateQueries({ queryKey: ["conversation-messages", conversationId] });
          }
          qc.invalidateQueries({ queryKey: ["client-conversations"] });
        }
      )
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [conversationId, qc]);
}
```

Why this works:
- `tenant_conversations` has `REPLICA IDENTITY FULL`; `payload.new.id` is always populated.
- `fn_tm_on_message_insert` trigger updates `last_message_at` on every message insert → guaranteed UPDATE event.
- Unfiltered subscription with custom-RLS-friendly delivery — confirmed working on the staff side.
- `ClientLayout.tsx` global subscription remains untouched (independent invalidation path; harmless second refresh).

### Change 3 — `src/pages/ClientInboxPage.tsx` `MessagesTab` (after line 182)

Add a ref + effect that calls `markRead` whenever `selectedId` becomes set (URL deep link OR click) and the conversation is unread:

```ts
const markedReadRef = useRef<string | null>(null);

useEffect(() => {
  if (!selectedId || !conversations.length) return;
  if (markedReadRef.current === selectedId) return;
  const conv = conversations.find((c) => c.id === selectedId);
  if (conv?.isUnread) {
    markedReadRef.current = selectedId;
    markRead.mutate(selectedId);
  }
}, [selectedId, conversations, markRead]);
```

- `useRef` is already imported (line 1).
- Existing `if (conv.isUnread) markRead.mutate(conv.id)` in `handleSelect` (line 205) is left in place — redundant but harmless and keeps click-path latency identical.
- Ref prevents re-firing after `["client-conversations"]` refetch flips `isUnread` to false (no-op anyway) or in any other re-render of the same selection.

### Files explicitly NOT touched
- `src/components/ClientLayout.tsx`
- `src/hooks/useClientNotifications.tsx`
- `src/hooks/useClientInbox.ts`
- `src/components/NotificationDropdown.tsx`
- `src/pages/TeamCommunicationsPage.tsx` and any other staff hook/page
- `markRead.mutationFn` body (data fix supersedes any code change)
- All RLS, triggers (`fn_tm_on_message_insert`), notification emitters, schema

### Edge cases covered
- `conversationId` / `selectedId` null → existing guards.
- Deep link arrival (`/client/inbox?tab=messages&thread=…`) → URL effect sets `selectedId`, new effect marks read.
- Rapid thread switching → channel cleanup + ref tracks last-marked id.
- Clean data (no legacy null `source_id`) → migration is a no-op; code paths behave identically.
- Buggy data (41 legacy rows) → migration normalises, then `markRead` clears them on next open.
- Sender's own send → `sendMessage.onSuccess` already invalidates; realtime is harmless duplicate.
- Multiple browser tabs → each receives the UPDATE; React Query dedupes.

### Risk assessment
- **Backward compatibility:** Additive only. No removed behaviour. No schema change.
- **Access control / RLS:** Untouched. Refetched queries re-enforce RLS.
- **Audit trail:** `audit_events` write in `useConversationMessages` unchanged; no new write paths.
- **Performance:** One extra invalidation per conversation UPDATE. Bounded.
- **Cross-tenant safety:** Subscription is unfiltered at Realtime layer but query layer is tenant-scoped via RLS + `activeTenantId` filter — no leak.
- **Reversibility:** Code edits revert cleanly; migration backfill is one-way data normalisation but only fills nulls with the value the emitter would have supplied — no information loss.

### Summary
Migration + 2 file edits restore correct bell/unread behaviour for clients opening conversations from any entry point (click or notification deep link), using the same realtime pattern already validated on staff side.