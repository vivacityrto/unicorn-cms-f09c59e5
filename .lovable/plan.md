## Goal

Restore staff visibility into client Help Centre escalations (`help_threads` where `channel = 'support'`) on the admin Support Tickets page, additively. The existing `suggest_items`-backed tabs/table/hooks are untouched.

## Files added

### `src/components/support-tickets/useAdminHelpThreads.ts`
- Fetches `help_threads` where `channel = 'support'`, ordered by `updated_at desc`.
- Embeds `tenant:tenants!help_threads_tenant_id_fkey(id, name, rto_name)` (this FK exists).
- Does NOT embed users — no FK from `help_threads.user_id` to `users`. Instead, collects distinct `user_id`s and issues a second `supabase.from('users').select('user_uuid, full_name, email').in('user_uuid', ids)` and merges the reporter in JS (same pattern as `MessageTab.tsx`).
- Secondary query on `help_messages` (thread_id in list) to derive per thread: `unanswered` (no `role='staff'` message — same predicate as `useSupportTicketsBadge`), `message_count`, `last_message_at`, `last_message_role`, and `first_user_message` (used as subject fallback).
- Returns `AdminHelpThreadRow[]`. `staleTime: 30_000`, `refetchInterval: 60_000`.

### `src/components/support-tickets/useAdminHelpThreadMessages.ts`
- Fetches `help_messages` for a given `thread_id` ordered by `created_at asc`.
- Follow-up query resolves sender display names via `users.user_uuid` (no FK embed).
- Enabled only when `threadId` is set.

### `src/components/support-tickets/AdminHelpThreadsList.tsx`
- Table styled to match `AdminTicketsTable`. Columns: Subject (falls back to first user message; +"Unanswered" pill when `unanswered && status === 'open'`), Client, Submitted by, Status, Created, Last activity.
- Local search over subject/client/reporter. Simple status filter: `Open only` / `All`.
- Row click calls `onSelect(threadId)`; selected row gets a highlighted background.

### `src/components/support-tickets/AdminHelpThreadDetail.tsx`
- Loads messages via `useAdminHelpThreadMessages`.
- Renders bubbles with distinct styling for `role = 'user'` (client, left, white) vs `role = 'staff'` (right, purple `#7130A0`). Any other role (`assistant`, etc.) renders as a system amber note.
- Reply Textarea + Send button inserts into `help_messages` with `thread_id`, `sender_id = auth user id`, `role = 'staff'`, `content`; then updates `help_threads.updated_at`.
- "Mark as resolved" / "Reopen" buttons update `help_threads.status` between `resolved` and `open`.
- All success paths invalidate `['admin-help-threads']`, `['admin-help-thread-messages', threadId]`, and `['support-tickets-badge']`.
- Writes go directly through the authenticated supabase client (existing RLS already allows Vivacity staff to insert into `help_messages` and update `help_threads`).

### `src/components/support-tickets/ClientMessagesPanel.tsx`
- Composes list + detail with a `selectedThreadId` state.
- Desktop (`lg:`): side-by-side grid `[minmax(0,1fr) 420px]` with detail pinned on the right.
- Mobile: detail opens in a shadcn `Sheet` from the right.

## Files changed

### `src/pages/SupportTicketsPage.tsx` (additive)
- Add `view: 'internal' | 'client'` state (default `'internal'`).
- Compute `clientBadgeCount` = number of `help_threads` rows in `useAdminHelpThreads` data where `status === 'open'` && `unanswered === true` (exact match with `useSupportTicketsBadge`).
- Insert a small segmented control directly below the hero banner:
  - `Internal Tickets` (with count = `rows.length`)
  - `Client Messages` (with `clientBadgeCount`)
- When `view === 'internal'`: render the existing block byte-identically (stats / status tabs / filters / table). "Submit Support Ticket" button in the hero stays visible.
- When `view === 'client'`: render `<ClientMessagesPanel />` and hide the "Submit Support Ticket" button (it doesn't apply to client-originated threads).
- Admin gate (`is_vivacity_internal || isSuperAdmin`) and hero remain unchanged.
- `useAdminSupportTickets`, `AdminTicketStatusTabs`, `AdminTicketFilters`, `AdminTicketsTable`, `AdminTicketStats`, `NewTicketModal`: not modified.

## Out of scope

- `src/components/help-center/MessageTab.tsx` — the client-side widget for the `support` channel only writes on submit and does not fetch history or subscribe to new messages (unlike the `csc` channel). Staff replies made in this new admin view will therefore not appear in the client's in-app widget yet. This is called out as a known limitation and left as a separate follow-up.

## Verification

- Sidebar badge count equals the new `Client Messages` tab count.
- Selecting a thread renders the full ordered history with distinct client/staff bubbles.
- Sending a reply immediately appears in the detail view and drops the badge count when it was the first staff response.
- Marking resolved flips the status pill on the row; reopen restores it.
- Internal Tickets view behaviour is unchanged — Active/New/Triaged/… counts, filters, and CSV export match pre-change output.
