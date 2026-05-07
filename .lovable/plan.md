## Fix: Toast navigation lands on stale message thread

**File:** `src/components/layout/ClientLayout.tsx`

**Problem:** The `client-inbox-notifier-${activeTenantId}` realtime subscription (lines 47–80) invalidates `["client-conversations"]` and `["client-inbox"]` on a new `tenant_messages` INSERT, but does NOT invalidate `["conversation-messages", conversationId]`. With the global `staleTime: 2 * 60 * 1000`, when the user clicks "View" on the toast, React Query serves stale cached messages and the new inbound message is missing.

**Change:** In the subscription callback, after the null guard (line 59) and before the `toast(...)` call (line 61), add a single invalidation:

```ts
queryClient.invalidateQueries({ queryKey: ["conversation-messages", row.conversation_id] });
```

That is the only edit. No other invalidations, subscription logic, callers, hooks, or files are touched.

**Risk:** Negligible. One extra cache invalidation keyed by the actual conversation id from the realtime payload. Ensures the thread view fetches fresh on next mount/focus and AJ's new message is visible immediately.