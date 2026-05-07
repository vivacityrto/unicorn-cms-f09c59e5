## Fix markRead race condition in useClientCommunications

**File:** `src/hooks/useClientCommunications.ts` (lines 316–321 only)

**Problem:** The `user_notifications` UPDATE inside `markRead.mutationFn` is fire-and-forget (`void ....then(...)`). The mutation resolves immediately, `onSuccess` invalidates `["client-notifications"]`, and the refetch races the still-pending UPDATE — so `is_read` is often still `false` when the bell re-reads, leaving the count stale.

**Change:** Replace the fire-and-forget block with an awaited call that swallows errors:

```ts
try {
  await (supabase
    .from("user_notifications" as any)
    .update({ is_read: true } as any)
    .eq("user_id", currentUserId!)
    .eq("source_id", conversationId)
    .eq("is_read", false) as any);
} catch (_) {}
```

**Untouched:** the preceding `conversation_participants` update, `onSuccess` invalidations, query keys, bell component, RLS, and every other file.

### Verification
- Lines 309–314 already await the participants update and throw on error — unchanged.
- Lines 323–326 already invalidate both `client-conversations` and `client-notifications` — now correct because the UPDATE has resolved before they fire.
- Error swallowing matches the original intent (notification mark-read is best-effort and must not fail the conversation read).

### Risk
Negligible. Pure timing fix in a single mutation. No schema, RLS, FK, or interface change. Worst case: a transient Supabase error on `user_notifications` is silently ignored — same as today.
