# Audit: 2026-11-20 — restrict-conversation-access-to-participants

**Trigger:** the messenger redesign plan (Carl approved "Approve as recommended" on 20 November 2026, which included tightening conversation access in the foundations phase). The access rules were reviewed before building on them.
**Scope:** migration `20261120120000_restrict_conversation_access_to_participants.sql`: replaces the row-level security policies on `public.tenant_conversations` (4) and `public.conversation_participants` (4). No row is changed. No function, view or table definition changes.
**Status:** **Applied to production on 20 November 2026** (Carl: "Apply both"), via the Supabase MCP `apply_migration` as `restrict_conversation_access_to_participants`, after two rolled-back dry runs. Postflight verified (below). It was applied after the broadcast recipient migration (`2026-11-20-broadcast-recipients-active-members`).

## The exposures

Any member of a client organisation (through the legacy `tenant_users` table or `has_tenant_access_safe`) could:

1. **Read the subject and last-message preview of every conversation of their organisation**, including ones they are not in (`tc_select`). Message bodies were already protected by `tenant_messages`.
2. **Change any conversation of their organisation**: subject, status, assignee (`tc_update_auth`). Confirmed in the dry run: one client contact could update all 13 of their organisation's conversations.
3. **Add themselves or anyone else to any conversation of their organisation** (`cp_insert_auth`), which then grants read access to its messages. Confirmed in the dry run: one client contact could add themselves to a conversation they were not in.

## What changes

- **`tc_select`:** Vivacity staff and super admins, or a person who has access to the organisation and either started the conversation or is a participant.
- **`tc_update_auth`:** staff and super admins only. No client code path updates conversations (previews are kept by the message trigger, which is `SECURITY DEFINER`).
- **`cp_insert_auth`:** staff and super admins, or the creator of the conversation adding a person with access to that organisation. This keeps the client "start a conversation" flow working (add yourself, add the primary consultant).
- **`tc_insert_auth`:** staff and super admins, or an active member (the canonical `has_tenant_access_safe` gate, ADR-019) creating their own conversation. It previously checked the legacy `tenant_users` table, so an active member missing from it could not start a conversation and a stale `tenant_users` row could.
- **Unchanged in effect:** `tc_delete_staff`, `cp_select_member`, `cp_update_own`, `cp_delete_admin`. They are recreated (all policies on both tables are swept first, so an older differently named policy cannot still admit members) and now apply to signed-in users only.

## Impact measured before writing (production, read-only, counts only)

346 of 1,430 (client user, conversation) pairs stop being visible; 283 of those are broadcasts and 55 client users are affected. They were never participants, so they could not open those threads. A product follow-up is open: whether a user added to an organisation after a broadcast should be added to its earlier broadcasts as participants. Not decided here.

## Broadcast messages (checked specifically, at Carl's request)

- **Sending is unaffected.** `send-broadcast-campaign` and the scheduled-delivery path use the service role, which bypasses these policies. They create the conversation and add the sending staff member and every `tenant_users` row of the organisation as participants. Read tracking (`broadcast_recipients`, `fn_mark_conversation_read`) is `SECURITY DEFINER` and untouched. Staff keep full access, so Bulk message history and read receipts behave as before.
- **Recipients are exactly the participants.** After this change a client sees a broadcast only if they are a participant, which is the same set that could already open it.
- **What is hidden:** 32 client users are missing from at least one broadcast's participants. 25 of them are in `tenant_users` (joined after the older broadcast), 7 are active in `tenant_members` but not in `tenant_users`. For the older ones, hiding is correct. For the 7, it is a pre-existing gap: the broadcast function mirrors `tenant_users`, not `tenant_members`, so they never received broadcasts and could only see their subject lines. Not fixed here; recorded as an open item.
- **The messenger keeps this model:** broadcast threads are read only, filterable as "From Vivacity", and the Inbox source must mark them read through `fn_mark_conversation_read`, not by updating a participant row directly.

## Dry run (production, rolled back)

As a real client contact who is in some conversations of their organisation and not others (and is in the legacy `tenant_users` table so the create flow could be tested), before then after the migration SQL:
- **Visible conversations:** 13 then 11 (exactly the ones they are in: 11 own participant rows).
- **Update every conversation of their organisation:** 13 rows updated, then 0.
- **Add themselves to a conversation they are not in:** allowed, then refused.
- **Create a conversation, add themselves and the primary consultant:** worked before and still works.
- **As Vivacity staff:** all 15 visible and 15 updatable, unchanged.
- **Membership gate change (second dry run):** a real active member who is not in `tenant_users` could not start a conversation before (refused) and can after, adding themselves; a person with only a stale `tenant_users` row (not an active member) could start one before (allowed) and cannot after (refused). Of the 37 active members missing from `tenant_users`, only 8 have both a valid organisation and an auth account; the rest are historical orphans (ADR-020).
- 4 policies on each table after. No names, emails or message text were printed. The block ended with a deliberate exception so nothing persisted.

## Postflight (production, after apply; the check itself was rolled back)

- 4 policies on `tenant_conversations` and 4 on `conversation_participants`; none reference the legacy `tenant_users` table.
- As a real client contact (also a participant of a broadcast): 12 of the organisation's 15 conversations visible (exactly their own 12 participant rows); updating conversations touched 0 rows; adding themselves to a conversation they are not in was refused; the broadcast they are in is visible and `fn_mark_conversation_read` works on it; updating their own read position changed 1 row; creating a conversation and adding themselves and the primary consultant worked.
- As Vivacity staff: every conversation visible and updatable (the test's own new conversation made it 16 of 16).
- No names, emails or message text were printed.

## Not done

- Applying it to production (waits for go-ahead). After applying: postflight (4 + 4 policies, client cannot update a conversation or join one they are not in, create flow works, staff intact) and the status here changes to "applied".
- Retiring the legacy `tenant_users` clauses on other tables (ADR-019 item 3, separately authorised).

**Rollback:** restore the previous eight policies from `supabase/migrations/20260506045321*` and `20260513045909*` (and any later changes to them). Doing so re-opens the exposures.
