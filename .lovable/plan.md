## Fix client inbox realtime in useConversationRealtime

**File:** `src/hooks/useClientCommunications.ts` (lines 44–60 only)

**Problem:** The subscription listens to `tenant_conversations` UPDATE events, which fire indirectly (and unreliably) when a new message arrives. The client thread therefore needs a manual reload to display new staff messages.

**Change:** Replace the subscription block with a direct INSERT subscription on `tenant_messages` filtered by `conversation_id`, matching the pattern used in `TeamCommunicationsPage.tsx`:

```ts
const channel = supabase
  .channel(`conv-live:${conversationId}`)
  .on(
    "postgres_changes" as any,
    {
      event: "INSERT",
      schema: "public",
      table: "tenant_messages",
      filter: `conversation_id=eq.${conversationId}`,
    },
    () => {
      qc.invalidateQueries({ queryKey: ["conversation-messages", conversationId] });
      qc.invalidateQueries({ queryKey: ["client-conversations"] });
    }
  )
  .subscribe();
```

**Untouched:** the surrounding `useEffect`/cleanup, `markRead` mutation, `onSuccess` invalidations, `TeamCommunicationsPage.tsx`, and every other file.

### Risk
Negligible. Single-hook timing/source fix. `useConversationRealtime` is only consumed by `useConversationMessages` in the same file — no other callers. No schema, RLS, or interface change.
