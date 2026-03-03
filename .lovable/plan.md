
# Bulk Communications System - Implementation Plan

## Overview

Build a broadcast messaging system allowing Vivacity staff to send bulk in-app messages to targeted audiences. Messages appear in the Client Portal Communications tab as "Announcement" threads, replies route to the assigned CSC, and all sends are fully auditable.

---

## 1. Database Migration

### A. New Tables

**`broadcast_campaigns`**
- `id uuid PK default gen_random_uuid()`
- `title text NOT NULL`
- `body text NOT NULL`
- `target_mode text NOT NULL` -- 'everyone', 'members', 'package_type'
- `package_type text NULL` -- required when target_mode = 'package_type'
- `include_roles text[] DEFAULT ARRAY['parent']` -- maps to tenant_users.role ('parent' = Admin, 'child' = User)
- `status text NOT NULL DEFAULT 'draft'` -- draft, queued, sending, sent, cancelled
- `scheduled_for timestamptz NULL`
- `created_by uuid NOT NULL`
- `created_at timestamptz DEFAULT now()`
- `sent_at timestamptz NULL`
- `total_recipients integer DEFAULT 0`
- `total_sent integer DEFAULT 0`
- `total_failed integer DEFAULT 0`

RLS: Vivacity staff can SELECT/INSERT/UPDATE. Clients cannot access.

**`broadcast_recipients`**
- `id uuid PK default gen_random_uuid()`
- `campaign_id uuid NOT NULL REFERENCES broadcast_campaigns(id)`
- `tenant_id bigint NOT NULL`
- `user_id uuid NOT NULL`
- `conversation_id uuid NULL` -- linked conversation after send
- `delivery_status text DEFAULT 'queued'` -- queued, sent, failed, skipped
- `sent_at timestamptz NULL`
- `failure_reason text NULL`

Index on `campaign_id`. RLS: Staff only.

### B. SQL Functions

**`fn_preview_broadcast_recipients(p_target_mode text, p_package_type text, p_include_roles text[])`**
Returns `TABLE(tenant_id bigint, user_id uuid, tenant_name text)`.

Logic:
- `everyone`: All non-system, non-archived tenants -> active, non-disabled, non-archived users filtered by role
- `members`: Tenants with an active `package_instances` row where the linked package has `package_type = 'membership'`
- `package_type`: Tenants with active `package_instances` where linked package matches the specified `package_type`
- Deduplicates by `user_id`
- Excludes system tenant (id = 6372)

**`fn_queue_broadcast_campaign(p_campaign_id uuid)`**
- Validates campaign status = 'draft'
- Calls preview function to generate recipients
- Inserts into `broadcast_recipients`
- Updates campaign status to 'queued', sets `total_recipients`

### C. Audit

Insert into `audit_events` on campaign creation, queuing, and completion with campaign details.

---

## 2. Edge Function: `process-broadcast`

Processes a queued broadcast campaign in batches.

For each recipient (batch of 50):
1. Find or create a `tenant_conversations` row for the tenant with `type = 'broadcast'`, `related_entity = 'broadcast_campaign'`, `related_entity_id = campaign_id`
2. Add recipient as conversation participant (role = 'client') if not already present
3. Add tenant's primary CSC as participant (role = 'csc') if not already present
4. Insert message into `messages` table (sender = campaign creator)
5. The existing `trg_notify_conversation_participants` trigger auto-creates `user_notifications`
6. Update `broadcast_recipients.delivery_status = 'sent'`

On completion: update campaign status to 'sent', set `sent_at`, `total_sent`, `total_failed`.

All operations use service role client. Campaign creator's user_uuid is logged.

---

## 3. Frontend: Broadcast Management Page

### Route & Navigation
- New lazy import `BroadcastCampaignsWrapper` at `/communications/broadcast`
- Add "Broadcast" sub-item under existing "Communications" sidebar entry (Clients section)

### Broadcast List Page (`BroadcastCampaignsPage.tsx`)
- Table with columns: Title, Target, Status, Recipients (sent/total), Created by, Created at
- Status badges: draft (grey), queued (blue), sending (amber), sent (green), cancelled (red)
- "Create Campaign" button opens form dialog

### Create Campaign Dialog
- Title (required)
- Message body (required, multiline Textarea)
- Target audience: Radio group (Everyone, All Members, By Package Type)
  - If "By Package Type": dropdown of package_type values (audit, membership, project, regulatory_submission)
- Recipient roles: Checkbox group (Admins only [default], All tenant users)
- Preview panel (fetched via `fn_preview_broadcast_recipients`):
  - Tenant count, User count
  - First 20 tenant names listed
  - Excluded count if applicable
- Send button disabled if preview count = 0
- On submit: insert campaign -> call `fn_queue_broadcast_campaign` -> invoke edge function

### Campaign Detail View
- Shows campaign metadata + recipient table with delivery status per user
- Read-only after sent

---

## 4. Client Portal Integration

Broadcast messages automatically appear in the Communications tab because they create standard `tenant_conversations` + `messages` rows. The conversation `type = 'broadcast'` renders with an "Announcement" badge.

Changes to `ClientCommunicationsPage.tsx`:
- Add `broadcast: "bg-amber-100 text-amber-800"` to `TYPE_COLORS`

Changes to `TeamCommunicationsPage.tsx`:
- Add `broadcast` to `TYPE_COLORS`

Replies by clients go through normal messaging flow and route to the CSC already added as a participant.

---

## 5. Hook: `useBroadcastCampaigns.ts`

New hook providing:
- `campaigns` query (list all campaigns)
- `previewRecipients` query (calls `fn_preview_broadcast_recipients`)
- `createCampaign` mutation
- `queueCampaign` mutation (calls `fn_queue_broadcast_campaign`)
- `sendCampaign` mutation (invokes `process-broadcast` edge function)

---

## 6. Files Created / Modified

| File | Action |
|------|--------|
| SQL Migration | `broadcast_campaigns`, `broadcast_recipients`, `fn_preview_broadcast_recipients`, `fn_queue_broadcast_campaign`, RLS policies |
| `supabase/functions/process-broadcast/index.ts` | New edge function |
| `supabase/config.toml` | Add `[functions.process-broadcast]` with `verify_jwt = false` |
| `src/hooks/useBroadcastCampaigns.ts` | New hook |
| `src/pages/BroadcastCampaignsPage.tsx` | New page with list + create dialog |
| `src/pages/BroadcastCampaignsWrapper.tsx` | DashboardLayout wrapper |
| `src/App.tsx` | Add route `/communications/broadcast` |
| `src/components/DashboardLayout.tsx` | Add Broadcast sub-link under Communications |
| `src/pages/ClientCommunicationsPage.tsx` | Add `broadcast` type color |
| `src/pages/TeamCommunicationsPage.tsx` | Add `broadcast` type color |

---

## Technical Notes

- `tenant_users.role` values are 'parent' (Admin) and 'child' (User) -- the campaign `include_roles` maps to these values
- `tenants.id` is `bigint`, used throughout as tenant_id
- `package_instances.tenant_id` + `packages.package_type` used for membership/package_type filtering
- One conversation per tenant per campaign (deduped by `related_entity_id = campaign_id` + `tenant_id`)
- Edge function uses service role to bypass RLS for bulk inserts
- Existing message triggers handle notification creation automatically
- No external emails sent -- in-app only
