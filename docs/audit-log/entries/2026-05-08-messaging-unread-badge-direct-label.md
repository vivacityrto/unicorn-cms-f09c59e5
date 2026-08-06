# Audit: 2026-05-08 — messaging-unread-badge-direct-label

**Trigger:** ad-hoc — three related messaging UX bugs surfaced during manual review of the Team Communications page
**Scope:** Team Communications page (staff/CSC view), Client Inbox messages tab, nav badge hook, conversation subject display. No database schema changes. No client notification system touched.

## Findings

- **Bug 1 — Unread/read visual indistinguishable (staff view):** `TeamCommunicationsPage.tsx` applied only `font-semibold` vs `font-medium` with a tiny 8 px cyan dot and no background change for unread rows. The contrast between `font-semibold` and `font-medium` is imperceptible at normal reading distance, particularly on the purple-tinted sidebar background. No background highlight existed.

- **Bug 1 — Unread/read visual indistinguishable (client view):** `ClientInboxPage.tsx` Messages tab rendered the conversation subject as `font-medium` for both read and unread threads — the Mail/MailOpen icon swap was the only differentiation, which was insufficient.

- **Bug 2 — Communications nav badge inflated and stale (all Vivacity staff):** `useTeamUnreadCount.ts` queried ALL `tenant_conversations` visible to the user (granted by the `tc_select_staff` RLS policy, which gives every Vivacity staff member SELECT access to all conversations), then cross-referenced `conversation_participants` for the current user's `last_read_at`. Any conversation the user could see but had never joined as a participant (no participant row) was counted as unread — inflating the badge for all staff, most severely for Super Admins who have the broadest view. Additionally, the realtime subscription listened only to `tenant_conversations` UPDATE events; marking a conversation as read updates `conversation_participants.last_read_at`, not `tenant_conversations`, so the badge never re-queried after reading and stayed stale indefinitely.

- **Bug 3 — "Message your CSC" subject clutters staff conversation list:** All client-initiated Direct (CSC) conversations are stamped with the hardcoded subject `"Message your CSC"` by `MessageTab.tsx`. From the staff Team Communications list, a CSC sees an identical subject across every client's Direct thread. The `loadCscThread` function correctly reuses an existing open Direct conversation per user (no duplicate creation bug), so the problem is purely display: the subject field for Direct threads carries no useful information and should not be treated as a user-written title.

- **Conversation type badges clarified (informational):** The four conversation types — Direct (plain outline), General (grey), Package (blue/primary), Task (teal/accent) — are assigned at conversation creation. Direct = client-initiated CSC thread; General = catch-all staff-initiated; Package/Task = linked to a specific entity via `related_entity_id`. Not a bug, surfaced for documentation.

## KB changes shipped

- no changes

## Codebase observations (read-only)

- unicorn @ `b6ed9c3da471e137fad348ddfad7ca3a8bbf74e4`: Bug 1 + Bug 2 fix shipped — `TeamCommunicationsPage.tsx` unread rows gain `bg-primary/5` background + `font-semibold`/`font-normal` weight contrast; `ClientInboxPage.tsx` Messages tab gains conditional `font-semibold`/`font-medium text-muted-foreground` on subject; `useTeamUnreadCount.ts` rewritten to drive count from `conversation_participants` with `!inner` join to `tenant_conversations` (scopes to actual participation only) and adds a second realtime channel on `conversation_participants` UPDATE filtered to `user_id=eq.${currentUserId}` so badge clears immediately on read.
- unicorn @ `82ca925a982e85ee26aca4a479daa562a1591dbf`: Bug 3 fix shipped — `TeamCommunicationsPage.tsx` conversation list row and thread detail header now render `"Direct message"` for `type === "direct"` conversations instead of the stored `conv.subject`. All other types (General, Package, Task) unchanged. `ClientInboxPage.tsx` untouched — clients still see "Message your CSC" which is contextually correct for their single-thread view.

## Decisions

- Chosen approach for Bug 3: display-side fix only — do not change the stored subject, do not prompt the client for a subject. The `tenant_name` already identifies the client; "Direct message" as a fixed label communicates conversation type without adding noise. Client-initiated conversations are not the right moment to ask for a subject.
- No data cleanup performed on pre-existing duplicate "Message your CSC" threads. Existing threads are preserved; the reuse logic in `loadCscThread` (filter: `topic=csc`, `created_by_user_uuid=myUuid`, `status=open`) was already correct and prevents new duplicates going forward.

## Open questions parked

- The four conversation type badges (Direct, General, Package, Task) are not currently documented in the KB for onboarding. Worth adding to a reference doc so CSCs understand the colour coding.
- Super Admin accounts will see their Communications badge drop significantly after Bug 2 fix ships — worth a heads-up to Angela so the count reduction is not mistaken for lost messages.

## Tag

audit-2026-05-08-messaging-unread-badge-direct-label
