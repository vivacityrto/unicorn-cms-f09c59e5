# Fix: Client Inbox Infinite Mark-Read Loop

## Problem

In `src/pages/ClientInboxPage.tsx` (MessagesTab), the auto mark-as-read effect at lines 190–196 lists the entire `markRead` mutation object in its dependency array:

```ts
useEffect(() => {
  if (!selectedId || !conversations.length) return;
  const conv = conversations.find((c) => c.id === selectedId);
  if (conv?.isUnread) {
    markRead.mutate(selectedId);
  }
}, [selectedId, conversations, markRead]);
```

`useMutation` returns a new object reference on every state transition (idle → pending → success → idle) and on each query/cache change. Because `conv.isUnread` doesn't flip to `false` until the `conversations` query refetches and the cache is updated, the effect re-fires on the next `markRead` re-render with `isUnread` still true, calling `markRead.mutate` again. This produces a tight loop of PATCH requests against `conversation_participants`, saturates React Query's mutation queue, and starves `sendMessage.mutateAsync` of a render slot — so message sending appears blocked.

`markRead.mutate` itself is a stable bound function (React Query guarantees referential stability of `.mutate`/`.mutateAsync`), so depending on it instead of the wrapper object breaks the loop without changing semantics.

## Change (single file, single hunk)

`src/pages/ClientInboxPage.tsx`, replace lines 189–196:

```tsx
// Auto mark-as-read whenever a conversation becomes selected (click or deep link)
const mutateMarkRead = markRead.mutate;
useEffect(() => {
  if (!selectedId || !conversations.length) return;
  const conv = conversations.find((c) => c.id === selectedId);
  if (conv?.isUnread) {
    mutateMarkRead(selectedId);
  }
}, [selectedId, conversations, mutateMarkRead]);
```

Nothing else in the file changes. `handleSelect` keeps its existing `markRead.mutate(conv.id)` call (line 214) — that path is correct and is the primary mark-read trigger; the effect only covers deep-link / URL-param entry where `handleSelect` was never invoked.

## Out of Scope (explicitly untouched)

- `handleSelect` (line 208) — unchanged.
- `src/hooks/useClientCommunications.ts` — no changes.
- `useConversationRealtime`, `sendMessage`, `createConversation` — no changes.
- `TeamCommunicationsPage.tsx` — no changes.
- Any database table, RLS policy, FK, migration, or edge function — no changes.

## Deep-Dive Verification

1. **Referential stability of `markRead.mutate`** — React Query binds `mutate` once per `useMutation` invocation; it does not change across state transitions of the same mutation instance. Safe to use as a dep.
2. **Effect still fires when expected** —
   - Deep link with `?thread=...`: `selectedId` set from URL → effect runs once → marks read.
   - User clicks conversation: `handleSelect` marks read directly; effect's `conv.isUnread` check is then false on the cache refresh, so it is a no-op.
   - New incoming message on currently-selected conversation that flips `isUnread` back to true: `conversations` reference changes from realtime invalidation → effect re-runs → marks read once. Loop is impossible because once the optimistic / refetched cache reports `isUnread = false`, the guard short-circuits.
3. **No double-fire risk** — even if the effect runs twice in quick succession (StrictMode dev double-invoke or a fast cache update), the underlying `markRead` mutation is idempotent at the data layer (`last_read_at = now()` on `conversation_participants`), and the existing `handleSelect` already calls it on click without issues.
4. **Audit trail** — `markRead` writes to `conversation_participants.last_read_at` only; no audit-loggable material change is altered. Existing audit behaviour preserved.
5. **RLS / FK** — no schema or policy change; the mutation uses the same RLS-scoped update as today.
6. **Backward compatibility** — pure client-side render fix; no contract change for hooks, components, or APIs. No migration needed.
7. **Other consumers of `markRead`** — `handleSelect` continues to use `markRead.mutate` directly. No other call sites in this file.

## Risk Assessment

- **Severity of fix**: Low risk, single-line semantic change in one effect.
- **Regression surface**: MessagesTab only. No impact on Notifications tab, Team Communications, client portal RLS, or message send/receive pipeline.
- **Test coverage**: Manual smoke — (a) deep-link to unread thread marks read once; (b) click unread thread marks read once; (c) send message succeeds without latency; (d) network panel shows a single PATCH per selection, not a burst.
- **Rollback**: Revert the one hunk.

## Summary of Changes

- One file, one effect: extract `markRead.mutate` into `mutateMarkRead` and use it as the effect dependency in place of the unstable `markRead` object.

## Benefits

- Eliminates the mark-read PATCH storm against `conversation_participants`.
- Unblocks `sendMessage.mutateAsync` so messages send normally.
- Reduces Supabase write load and realtime channel noise.
- Preserves deep-link and realtime mark-read behaviour exactly as designed.
