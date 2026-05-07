# Fix A & Fix B — Inbox auto-read + Staff URL sync

## Fix A — `src/pages/ClientInboxPage.tsx` (MessagesTab)

Remove the `markedReadRef` ref and its check in the auto-mark-read effect. The `conv?.isUnread` guard is self-limiting: after `markRead` mutates and `["client-conversations"]` refetches with `isUnread=false`, the effect re-runs but no-ops. This restores auto-mark-read when new messages arrive on an already-open conversation.

**Line 183** — delete:
```ts
const markedReadRef = useRef<string | null>(null);
```

**Lines 191–199** — replace with:
```ts
useEffect(() => {
  if (!selectedId || !conversations.length) return;
  const conv = conversations.find((c) => c.id === selectedId);
  if (conv?.isUnread) {
    markRead.mutate(selectedId);
  }
}, [selectedId, conversations, markRead]);
```

Leave `handleSelect` (line 211–218) untouched — its inline `markRead.mutate(conv.id)` remains as the immediate click trigger.

## Fix B — `src/pages/TeamCommunicationsPage.tsx`

Three surgical edits to keep the `?thread=` URL in sync with `selectedId`.

**Line 63** — add setter:
```ts
const [searchParams, setSearchParams] = useSearchParams();
```

**Line 234–235** (`handleSelectConversation`) — add URL update right after `setSelectedId(convId);`:
```ts
setSelectedId(convId);
setSearchParams({ thread: convId }, { replace: true });
```

**Lines 485–488** (`onCreated` on `NewTeamMessageDialog`) — add URL update:
```ts
onCreated={(id) => {
  setSelectedId(id);
  setSearchParams({ thread: id }, { replace: true });
  qc.invalidateQueries({ queryKey: ["team-conversations"] });
}}
```

The `lastAutoSelectedRef` guard in the auto-select effect (lines 255–260) prevents the `?thread=` write from re-triggering `handleSelectConversation`, since it stamps `lastAutoSelectedRef.current = threadId` before invoking. No risk of loop.

## Out of scope (do not touch)
- `useConversationRealtime`, `sendMessage`, any other hook
- `lastAutoSelectedRef` logic and the auto-select effect
- `last_read_at` stamping and `user_notifications` mark-read in `handleSelectConversation`
- `NewTeamMessageDialog` internals
- Client portal files beyond the `MessagesTab` edit above
- No DB, RLS, migrations, edge functions

## Risk
Minimal. Both changes are additive/subtractive at the React state layer. Fix A is self-limiting via existing `isUnread` data flow. Fix B's URL write uses `replace: true` (no history pollution) and is guarded against re-entry by the existing `lastAutoSelectedRef`.
