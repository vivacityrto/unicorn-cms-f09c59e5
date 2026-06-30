## Bulk Messaging in Team Communications (revised)

Build the Edge Function + UI on top of existing `broadcast_campaigns`, `broadcast_recipients`, `fn_preview_broadcast_recipients()`, `fn_queue_broadcast_campaign()`. No DB schema changes.

### Key corrections from prior plan
- **One conversation per tenant**, not per recipient row. Group `broadcast_recipients` by `tenant_id` before delivery — multiple parent contacts on the same tenant share one conversation (which is what the portal's participant model already fans out for them). Without this, 9 of the 11 current Diamond tenants would get duplicate messages.
- **Staff gating uses `is_team OR unicorn_role IN (...)`** in both Edge Function and frontend. Angela's account has `is_team=false, unicorn_role='Super Admin'` — a unicorn_role-only check would lock her out (this gap has been hit before).
- Add a `broadcast:` colour key to the conversation badge maps so the new conversation type renders consistently.

### 1. Edge Function: `send-broadcast-campaign`

New file `supabase/functions/send-broadcast-campaign/index.ts`.

- Service client for delivery; user-scoped client only to verify the caller.
- Caller auth: `getClaims()` → fetch `users (user_uuid, is_team, unicorn_role)` for `sub`. Reject with 403 unless `is_team = true OR unicorn_role IN ('Super Admin','Team Leader','Team Member')`.
- Input: `{ campaign_id: uuid }`. Reject unless campaign `status='queued'`.
- Load all `broadcast_recipients` rows for the campaign with `delivery_status='queued'`.
- **Group by `tenant_id`** in JS into `Map<tenant_id, recipient_row[]>`.
- For each tenant group, in chunks of 25 tenants:
  1. Insert one `tenant_conversations` row: `tenant_id`, `topic='general'`, `type='broadcast'`, `subject=campaign.title`, `created_by_user_uuid=<staff>`, `status='open'`.
  2. Upsert `conversation_participants`: staff (role `staff`) + every `tenant_users.user_id` for that tenant (role `client`) — mirrors the single-message flow at TeamCommunicationsPage.tsx:817-833.
  3. Insert one `tenant_messages` row: `conversation_id`, `sender_user_uuid=<staff>`, `sender_type='staff'`, `body=campaign.body`, `tenant_id`.
  4. On success: update **every** recipient row in this tenant group → `delivery_status='sent'`, `sent_at=now()`, `conversation_id=<the one conv id>`.
  5. On failure: update every recipient row in the group → `delivery_status='failed'`, `failure_reason=err.message`. Continue with the next tenant.
- After all groups: update `broadcast_campaigns` → `status='sent'`, `total_sent = count(sent recipients)`, `total_failed = count(failed recipients)`, `sent_at=now()`.
- Write `client_audit_log` row: `action='broadcast:send'`, `entity='broadcast_campaigns'`, `entity_id=campaign_id`, `details={total_tenants_messaged, total_recipients, total_sent, total_failed}`, `actor_user_id=<staff>`.
- Returns `{ total_sent, total_failed, conversations_created }`.

Net effect: every parent contact on a tenant sees the broadcast inside the same conversation, no duplicates.

### 2. Frontend — `BulkMessageDialog.tsx`

New `src/components/communications/BulkMessageDialog.tsx`, 3-step wizard.

- **Step 1 (Audience)**
  - "Send to" Select → `target_mode`: `everyone`, `members`, `tier`, `package_type`.
  - `tier`: second Select Diamond/Gold/Ruby/Sapphire/Amethyst → lowercase `package_type` arg.
  - `package_type`: second Select sourced from distinct `packages.package_type`.
  - Debounced 400ms `supabase.rpc('fn_preview_broadcast_recipients', { p_target_mode, p_package_type, p_include_roles: ['parent'] })`. Display "This will message {N} clients." (where N comes from preview; preview already returns recipient rows, so the dialog should additionally show distinct-tenant count: "across {T} tenants" if T ≠ N — this matches the actual delivery fan-out). Next disabled when 0.
- **Step 2 (Message)**: optional Subject; Category Select (general/package/task/rock); Message Textarea (required).
- **Step 3 (Review)**: plain-English audience summary + body preview + counts.
- **Confirmation guard**: explicit "You're about to message {T} clients. This cannot be undone." dialog before send (always required, especially for `everyone`).
- **Send**:
  1. Insert `broadcast_campaigns` (`title`, `body`, `target_mode`, `package_type`, `include_roles: ['parent']`, `status:'draft'`, `created_by:currentUserId`) → returns `id`.
  2. `supabase.rpc('fn_queue_broadcast_campaign', { p_campaign_id })`. Surface "No recipients matched" on error.
  3. `supabase.functions.invoke('send-broadcast-campaign', { body: { campaign_id } })`.
  4. Toast: `Message sent to {total_sent} recipients across {conversations_created} clients` (+ failed note if any). Close.

### 3. Wire into `TeamCommunicationsPage.tsx`

- Add `useAuth` profile field `is_team` to the select at `useAuth.tsx:94` so the gate works without a second query.
- Helper `canSendBulk = profile?.is_team === true || ['Super Admin','Team Leader'].includes(profile?.unicorn_role ?? '')`.
- Add "Bulk Message" button next to "New Message" (line 489 area), rendered only when `canSendBulk`.
- Add a tab control above the filters: **Conversations** / **Bulk Message History** (history visible only when `canSendBulk`). Conversations tab = existing UI unchanged.

### 4. Bulk Message History component

New `src/components/communications/BulkMessageHistory.tsx`. Read-only table.

- Query `broadcast_campaigns` ordered by `created_at desc`; join `users` for `created_by` display name.
- Columns: Title, Audience (derived from `target_mode` + `package_type`), Recipients, Sent, Failed, Sent By, Sent At, Status badge.
- No edit/delete.

### 5. Cosmetic — broadcast badge colour

- Add `broadcast: 'bg-amber-100 text-amber-700 border-amber-200'` (or brand-token equivalent) to:
  - `TYPE_STYLES` in `src/components/client/ClientMessagesTab.tsx` (~line 76)
  - `TYPE_COLORS` in `src/pages/ClientInboxPage.tsx` (~line 165)
  - `TYPE_COLORS` in `src/pages/TeamCommunicationsPage.tsx` (~line 60-70)
- No other rendering changes — broadcast conversations otherwise behave identically to existing types (verified: no code branches on `type` in a way that would hide or mis-render).

### 6. Acceptance verification

After build, in preview:
- Send `tier=diamond` and confirm: ~11 `tenant_conversations` rows created (one per tenant), `total_sent` = recipient count (~20), `total_failed=0`, all recipient rows share the right `conversation_id` per tenant.
- Confirm Angela's account (`is_team=false, unicorn_role='Super Admin'`) sees the Bulk Message button.
- Confirm a Team Member account does NOT see the History tab.
- Confirm `client_audit_log` has the send row.

### Files touched

- New: `supabase/functions/send-broadcast-campaign/index.ts`
- New: `src/components/communications/BulkMessageDialog.tsx`
- New: `src/components/communications/BulkMessageHistory.tsx`
- Edit: `src/pages/TeamCommunicationsPage.tsx` (button, tab switcher, broadcast badge colour)
- Edit: `src/hooks/useAuth.tsx` (add `is_team` to profile select + type)
- Edit: `src/components/client/ClientMessagesTab.tsx` + `src/pages/ClientInboxPage.tsx` (broadcast badge colour only)

### Non-negotiables honoured

- No changes to `broadcast_*` tables or the two RPCs.
- Service role only inside the Edge Function.
- Audit log written on every send.
- Reuses existing conversation/participant/message creation pattern.
- Staff gate uses `is_team OR unicorn_role IN (...)` everywhere.
- Confirmation guard required before send.
