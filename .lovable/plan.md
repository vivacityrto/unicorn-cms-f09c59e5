# Fix: Unread vs read visibility + inflated Communications badge

Three surgical changes. No DB/RLS/migration/schema changes. No mark-as-read mutation changes.

## 1. `src/pages/TeamCommunicationsPage.tsx` — conversation row styling

Inside the `renderRow` closure (currently lines 426–459), used for both "Your Conversations" and "Team Conversations" sections:

- Extend the row's `className` so unread, non-selected rows get `bg-primary/5`. Selected row keeps `bg-muted/70` and wins over unread.
- Change the subject `<p>` to use `font-semibold` (unread) vs `font-normal` (read). Currently uses `font-medium` for read.
- Keep the cyan unread dot and the Building2 header row exactly as-is.

```tsx
className={`w-full text-left px-4 py-3 hover:bg-muted/50 transition-colors ${
  selectedId === conv.id
    ? "bg-muted/70"
    : conv.isUnread
      ? "bg-primary/5"
      : ""
}`}
…
<p className={`text-sm truncate text-foreground ${conv.isUnread ? "font-semibold" : "font-normal"}`}>
```

The page's own `isUnread` derivation (line ~116) is **not** touched.

## 2. `src/pages/ClientInboxPage.tsx` — Messages tab row styling (lines 301–317)

- Extend the row container so unread, non-selected rows get `bg-primary/5`.
- Replace the subject `<p className="text-sm font-medium truncate text-foreground">` with conditional weight + colour:
  - Unread: `font-semibold text-foreground`
  - Read: `font-medium text-muted-foreground`
- **Do not** touch the `Mail` / `MailOpen` icon switch, the badge, the preview, or the timestamp.
- **Do not** touch the Notifications tab (lines ~530+) or `InboxItemRow.tsx` — already correct.

## 3. `src/hooks/useTeamUnreadCount.ts` — full rewrite of query + add second realtime channel

### Query (root cause: counted conversations the user can see but never joined)

Drive the count from the participant table directly, with an `!inner` join to the parent conversation:

```ts
const { data: rows, error } = await supabase
  .from("conversation_participants")
  .select("conversation_id, last_read_at, tenant_conversations!inner(last_message_at)")
  .eq("user_id", currentUserId)
  .not("tenant_conversations.last_message_at", "is", null);
```

Then count rows where `last_read_at IS NULL` OR `last_message_at > last_read_at`. Returns `0` if the user has no participant rows.

### Realtime (root cause: badge never refreshed when `conversation_participants.last_read_at` was updated)

Add a second channel alongside the existing `tenant_conversations` UPDATE channel:

```ts
const participantChannel = supabase
  .channel("team-unread-badge-participants")
  .on("postgres_changes" as any, {
    event: "UPDATE",
    schema: "public",
    table: "conversation_participants",
    filter: `user_id=eq.${currentUserId}`,
  }, invalidate)
  .subscribe();
```

Both channels are removed in the same effect cleanup. Query key and `staleTime: 30_000` unchanged.

## Edge cases handled

| Scenario | Outcome |
|---|---|
| Staff user with **no** participant rows | Query returns 0 rows → badge = 0 (was: counted every visible convo) |
| Participant row exists, `last_read_at IS NULL`, parent has `last_message_at` | Counted as unread |
| Participant row exists, `last_read_at IS NULL`, parent `last_message_at IS NULL` (no messages yet) | Excluded by `.not("...last_message_at", "is", null)` |
| User marks convo as read → `conversation_participants.last_read_at = now()` | Participant channel fires → invalidate → refetch → badge drops |
| New message arrives → trigger updates `tenant_conversations.last_message_at` | Existing convo channel fires → invalidate → badge increments |
| Channels on unmount | Both removed via `removeChannel` in the same cleanup |

## What stays untouched (explicit non-goals)

- `DashboardLayout.tsx` badge rendering and Support Tickets badge.
- `InboxItemRow.tsx` and the All / Notifications tab styling.
- `useClientNotifications.tsx`, `ClientTopbar.tsx`.
- `TeamCommunicationsPage.tsx` realtime subscriptions for incoming messages.
- The page-local `isUnread` derivation in `TeamCommunicationsPage.tsx`.
- `useClientCommunications.ts` mark-as-read mutation.
- All RLS policies (`tc_select_staff` etc.), triggers, schema, FKs.

## Backward-compatibility & integrity

- Hook signature returns `number` — unchanged. `DashboardLayout` consumer untouched.
- Query key `["team-unread-count", currentUserId]` unchanged → no cache key churn.
- `!inner` join obeys existing RLS (staff still see their participant rows; SELECT on `conversation_participants` was already exercised by the previous code path with the same `eq("user_id", ...)` predicate).
- No write paths added. No mutation changes. No schema changes.
- Realtime filter `user_id=eq.${currentUserId}` reduces server→client traffic vs the existing global convo channel.

## Risk assessment

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| Embedded join on `tenant_conversations` not allowed by RLS for some staff | Very low | Badge under-counts | Staff with `tc_select_staff` already see all convos; participant-scoped rows are a strict subset. |
| Realtime participant UPDATE firing for unrelated rows | None | — | Filter is server-side `user_id=eq.${id}`. |
| Channel name collision | None | — | Distinct channel names (`-convos`, `-participants`). |
| Visual regression in Communications list | Low | UI subtle | `bg-primary/5` is the same token used in the Notifications tab unread treatment — visually consistent. |
| Selected-row contrast lost when also unread | None | — | Selected state takes precedence in className. |

## Tested mental scenarios

- **Buggy data (today, staff Super Admin):** previously badge ≈ count of every convo across tenants. After fix: badge = count of staff-joined convos with new messages → drops to true unread (often 0 for newly-onboarded staff).
- **Clean data (staff joined to 3 convos, 1 with new msg):** badge = 1; clicking marks read → participant UPDATE → badge = 0 within ~1s realtime cycle.
- **No-participant staff:** badge = 0 immediately (no rows fetched).
- **New incoming message to a joined convo:** convo UPDATE → badge += 1.

## Summary & benefits

- Three files changed; no backend churn.
- Restores immediate visual distinction between read/unread in both staff and client conversation lists.
- Eliminates badge inflation by scoping the count to actual participation.
- Closes the stale-badge loop by listening to the table that the mark-as-read mutation actually updates.
- Self-contained, reversible by reverting the three files.
