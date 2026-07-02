
## Team Communications — 3-Pane Redesign

Confirmed decisions:
- **Topic badge map**: `general` + `bot_escalation` → **General**; `support` + `document_request` → **Topic**; `csc` → **Direct**.
- **Unread scope**: current staff member only (same source as sidebar `useTeamUnreadCount`).

### Scope
- Only touches `src/pages/TeamCommunicationsPage.tsx` (Conversations tab internals) and small new child components under `src/components/messaging/`.
- No changes to data model, RPCs, RLS, or edge functions.
- Bulk Message dialog, "+ New Message", tabs (Conversations / Bulk Message History), and composer behaviour preserved verbatim.

### Layout
Fluid 3-column grid inside the Conversations tab:

```text
┌──────────────┬────────────────────┬──────────────────────────┐
│ Clients rail │ Thread list         │ Conversation panel       │
│ ~w-64/w-72   │ ~w-80/flex          │ flex-1                   │
│ (lg+ visible)│ (md+ visible)       │ always                   │
└──────────────┴────────────────────┴──────────────────────────┘
```

Responsive rules (mirroring `DashboardLayout` breakpoints):
- `lg` and up: all three panes visible.
- `md`: Clients rail collapses to a compact icon strip (avatars only, tooltip on hover) with a toggle to expand.
- `< md`: single-pane stack — Clients rail slides in as a Sheet; thread list ↔ conversation swap based on `selectedConversationId` (mobile back button in the conversation header).

Uses `flex` / `grid-cols-[auto_20rem_1fr]` style with `min-w-0` on inner panes so nothing overflows; no fixed pixel widths that leave gaps.

### Clients Rail (new)
- New component `ClientsRail.tsx`.
- Derives client list from the already-loaded `conversations` query — group by `tenant_id`, compute `{threadCount, lastActivity, unreadCount}` per tenant.
- Pinned row at top: **"All Conversations"** — star icon in a `bg-primary/10 text-primary` tile, total thread count + aggregate unread badge (sum of per-user unreads).
- One row per tenant: coloured initials avatar (deterministic rotation across `brand-purple`, `brand-aqua`, `brand-fuchsia`, `brand-macaron`, `brand-acai` by hash of `tenant_id`), tenant name, `"{n} threads · {relative date}"`, unread `Badge` (only if > 0).
- Selection is local state `selectedTenantId: string | "all"`.
- Uses shadcn `ScrollArea` + `Button` (ghost variant, `data-state=active` styling on selection).

### Thread List (middle)
- Header block: scope title + count (`"12 threads across 5 clients"` for All, `"{n} threads"` for a tenant) + shadcn `Input` search box filtering by `subject` / `last_message_preview` (client-side).
- Rows rewritten (still one `Button`-ish clickable row per thread):
  - Top line: topic `Badge` (mapped variant) + tenant name + relative time.
  - Bold subject (`font-semibold`, truncate).
  - Preview line: prefix `"You: "` when `last_sender_type === 'staff'`; use `text-muted-foreground text-sm truncate`.
- Selected row: `bg-muted` + left border in `border-primary`.
- Unread indicator dot on rows where the current user has `last_message_at > last_read_at`.

Topic badge variants (reuse existing badge variants, no new hex):
- General → `variant="outline"`.
- Topic → `variant="info"` (aqua).
- Direct → `variant="default"` (purple/primary).

### Conversation Panel (right)
- Header: client-coloured avatar, subject (`text-lg font-semibold`), topic badge, subtitle `"{Tenant} · {Contact Name}"`, icon `Button` "Mark as unread" (Undo/BellOff icon) → sets `conversation_participants.last_read_at = null` for `(current user, conversation)` and refetches. Reuse the existing update pattern already used to mark as read.
- Messages area:
  - Group by calendar day. Insert a pill separator: `<div class="flex justify-center"><span class="px-3 py-1 rounded-full bg-muted text-xs text-muted-foreground">Thursday, 2 July</span></div>` using `date-fns` formatter already in the file.
  - Incoming (`sender_type !== 'staff'`): row `justify-start`, `Avatar` + sender name above bubble, bubble `bg-card border border-border rounded-2xl rounded-tl-sm px-4 py-2 text-sm`.
  - Outgoing (`sender_type === 'staff'`): row `justify-end`, bubble `bg-primary text-primary-foreground rounded-2xl rounded-tr-sm px-4 py-2 text-sm`, timestamp `text-xs text-muted-foreground` under bubble.
  - Attachments render as they do today (reuse existing attachment chip components).
- Composer: lifted unchanged — same textarea, Enter-to-send / Shift+Enter, attachment button, send button, and "paste a screenshot" tip.

### File plan
- **Edit** `src/pages/TeamCommunicationsPage.tsx`
  - Add `selectedTenantId` state and `threadSearch` state.
  - Replace 2-column layout inside Conversations tab with the 3-column grid described above.
  - Extract long JSX blocks into local components for readability.
  - Filter thread list by `selectedTenantId` and `threadSearch`.
  - Add "Mark as unread" handler (mutate `conversation_participants`).
- **New** `src/components/messaging/ClientsRail.tsx`
- **New** `src/components/messaging/ThreadList.tsx`
- **New** `src/components/messaging/ConversationPanel.tsx` (header + messages area; composer stays in the page or is passed as children)
- **New** `src/components/messaging/topicBadge.ts` — pure mapping helper `topicToBadge(topic) → { label, variant }`.
- **New** `src/lib/clientAvatarColor.ts` — deterministic `tenant_id → brand color token` mapping (returns Tailwind class pair, e.g. `bg-brand-purple-100 text-brand-purple-700`).

### Technical notes
- No new npm deps.
- All colours via existing tokens: `bg-primary`, `bg-muted`, `text-muted-foreground`, `border-border`, and the `brand-*` scales from `index.css`. No raw hex.
- Uses only shadcn primitives already in the repo: `Card`, `Badge`, `Button`, `ScrollArea`, `Input`, `Avatar`, `Sheet` (for mobile rail).
- Realtime subscriptions and existing React Query keys are untouched — client/thread aggregations are `useMemo` over the already-fetched data.
- Bulk Message tab and header actions are rendered outside the 3-pane grid and behave identically to today.
- Attached HTML mock used purely as visual reference; no code copied from it.

### Out of scope
- No changes to `useTeamUnreadCount`, RPCs, DB schema, or edge functions.
- No new toast/notification behaviour.
- No changes to Bulk Message flow.
