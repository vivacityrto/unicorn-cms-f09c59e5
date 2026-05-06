
# UI Cutover — Wire UI to `tenant_messages`

DB migrations M1–M5 are live. Three-file rewrite + verification of two follow-ups. No DB changes, no new dependencies.

## Verified ground truth

- `tenant_messages` columns: `id, conversation_id, tenant_id, sender_user_uuid, sender_type, body, meta, created_at`. No `is_read`, no `sender_id`.
- `conversation_participants` PK `(conversation_id, user_id)` → `onConflict:"conversation_id,user_id"` is safe.
- `tenant_csc_assignments`: `csc_user_id`, `is_primary`, `tenant_id`.
- Realtime + RLS for participants live (M1, M5).
- `audit_events.entity_id` is `uuid NOT NULL` — `conversationId` (uuid) fits without cast.
- Existing consumer `src/pages/ClientInboxPage.tsx` reads `msg.sender_id` and `msg.sender_name`. Hook keeps `sender_id` as an alias of `sender_user_uuid` so this consumer needs no edits.
- `/client/communications` is already redirected in `src/App.tsx` to `/client/inbox?tab=messages`. No other call sites.
- `useClientInbox.ts` only consumes `useClientCommunications`'s conversation list — no `messages` reads. No changes required.

## File 1 — `src/hooks/useClientCommunications.ts` (full rewrite)

- Replace all `.from("messages" as any)` with `.from("tenant_messages")`.
- SELECT: `id, conversation_id, sender_user_uuid, sender_type, body, created_at`.
- INSERTs (sendMessage + createConversation first message): `sender_user_uuid`, `sender_type:'client'`, `tenant_id`, `conversation_id`, `body`. No `sender_id`, no `is_read`.
- Map result to `ConversationMessage` with `sender_id = m.sender_user_uuid` (alias preserves consumer compatibility) and add `sender_type` field.
- After messages resolve and `length > 0`, fire-and-forget audit:
  ```ts
  void supabase.from("audit_events").insert({
    entity: "tenant_message_read",
    entity_id: conversationId,
    action: "messages_read",
    user_id: currentUserId,
    details: { conversation_id, tenant_id: activeTenantId, message_count: mapped.length }
  }).then(() => {}, () => {});
  ```
- `createConversation`: convert sender participant insert to `upsert(..., { onConflict:"conversation_id,user_id" })` and **throw on error** so RLS rejection surfaces. CSC participant upsert uses `ignoreDuplicates:true` so it never overwrites an existing CSC's `last_read_at`.
- New exported helper `useConversationRealtime(conversationId)` subscribes to INSERTs on `tenant_messages` filtered by `conversation_id=eq.<id>` and invalidates the message + conversation list queries on event. Cleans up on change/unmount. Called automatically inside `useConversationMessages` so all current callers get realtime "for free".

## File 2 — `src/pages/TeamCommunicationsPage.tsx` (in-place edits)

- Both reads and both inserts: `messages` → `tenant_messages`.
- Local `Message` interface: rename `sender_id` → `sender_user_uuid`. Update SELECT, name-map key, and the two UI sites (`isOwn` comparison line 297, `sender_name` render line 301).
- INSERT payloads (sendMessage + NewTeamMessageDialog first send): `sender_user_uuid`, `sender_type:'staff'`. Drop `sender_id`.
- After messages query resolves with `length > 0`, fire the same fire-and-forget audit (tenant_id from parent conversation row).
- Add realtime effect keyed on `selectedId` that invalidates `["team-conversation-messages", selectedId]` on INSERT, with cleanup.
- `NewTeamMessageDialog`: convert staff and client participant inserts to `upsert(..., { onConflict:"conversation_id,user_id" })` with `ignoreDuplicates:true` for the client side, and throw on the staff-side error.

## File 3 — `src/components/help-center/MessageTab.tsx` (CSC branch only)

Strategy: keep `support` and `chatbot` paths against `help_threads`/`help_messages` 100% intact. Branch on `channel === 'csc'` to a new code path.

CSC code path:

1. Local state `conversationId` (replaces `threadId`); messages shape `{ id, sender_user_uuid, body, created_at }`. UI alignment: own = `msg.sender_user_uuid === profile.user_uuid`.
2. Load effect (when `profile.user_uuid && channel === 'csc'`):
   - Resolve conversation: `select id from tenant_conversations where tenant_id and topic='csc' and created_by_user_uuid=mine and status='open' order by created_at desc limit 1`. If none, INSERT `{ tenant_id, topic:'csc', type:'direct', subject:'Message your CSC', created_by_user_uuid: mine, status:'open' }`.
   - **Ensure participants — surface failures to the user**:
     - Self upsert `{ conversation_id, user_id: mine, role:'member', last_read_at: now }` with `onConflict:"conversation_id,user_id"`. **If error → `toast.error("Could not initialize your message thread. Please refresh and try again.")` and abort load (no message fetch, no send).** This is the new requirement: M1 INSERT RLS depends on this row existing; a silent failure here would surface later as a confusing RLS rejection on send.
     - Lookup primary CSC: `tenant_csc_assignments where tenant_id and is_primary=true limit 1`. If found, upsert `{ conversation_id, user_id: csc_user_id, role:'csc' }` with `onConflict:"conversation_id,user_id"` and `ignoreDuplicates:true`. Failure here is non-fatal (toast warning, log) — the CSC will still see the thread on their next session via staff bypass; the user can still send.
   - Fetch messages from `tenant_messages` ordered by `created_at asc`. After resolve, fire read audit (same shape, `entity_id = conversationId`).
3. Send (CSC branch):
   - INSERT `tenant_messages { conversation_id, tenant_id: profile.tenant_id, sender_user_uuid: profile.user_uuid, sender_type:'client', body }`. Surface error via existing `toast.error`.
   - Update self `last_read_at` on `conversation_participants`.
   - Append optimistically; realtime will dedupe by `id`.
4. Realtime effect on `conversationId`: subscribe to INSERTs filtered by `conversation_id`. On event, append to local state if `id` not already present. Cleanup on change/unmount.
5. Existing avatars and empty-state copy unchanged. `support` and `chatbot` branches: zero changes.

## Smaller follow-ups (verified, no code changes needed)

- `src/hooks/useClientInbox.ts` — already only reads conversation list. ✅
- Hardcoded `/client/communications` strings — only the `App.tsx` redirect, which is correct. ✅

## Backward-compat & impact

- `ConversationMessage.sender_id` preserved (aliased), so `ClientInboxPage.tsx` keeps working without edits.
- Every send path now satisfies M1's participant-EXISTS check via prior `upsert`.
- CSC path explicitly surfaces participant-upsert failures, eliminating the "send fails with cryptic RLS error" footgun.
- `support`/`chatbot` Help Center branches and legacy `messages` table untouched.
- Read audits are fire-and-forget; never block UX.

## Risk assessment

- **Low (functional)**: participant rows are created before sends in every path; CSC errors surface to users.
- **Low (data shape)**: hook output preserves `sender_id` alias.
- **Low (realtime)**: failures degrade gracefully — query refetches on next interaction.
- **Medium-low (audit volume)**: ~1 row per conversation open per fetch; details payload is metadata only (no body). Acceptable; throttle later if noisy.
- **None**: no impact to support/chatbot branches or the legacy `messages` table.

## Test checklist

1. Client portal Inbox → open thread → messages render; one `tenant_message_read` row in `audit_events`.
2. Client send → staff sees message live in `TeamCommunicationsPage` via realtime; `user_notifications` row appears (M3).
3. Help Center → CSC tab on a tenant with a primary CSC → first message creates conversation + 2 participants; send succeeds.
4. Help Center → CSC with no primary CSC assigned → self participant still created, send still works (no CSC participant inserted; staff still see the thread via `tm_select_staff` bypass).
5. Force participant upsert failure (e.g., revoke permissions in test env) → user sees the toast and no broken send.
6. Help Center → Support tab unchanged (still writes `help_threads`/`help_messages`).
