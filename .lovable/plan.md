

# RLS Standardization: notification_outbox Table

## Current State
- **Table**: `public.notification_outbox`
- **RLS**: Already enabled
- **Existing Policies** (2 total):

| Policy Name | Operation | Logic | Issues |
|-------------|-----------|-------|--------|
| `SuperAdmins can view outbox` | SELECT | `is_vivacity_team_user(auth.uid())` | Uses legacy helper, should be SuperAdmin only |
| `Users can view own notifications` | SELECT | `recipient_user_uuid = auth.uid()` | Spec says users should NOT read this table |

**Key Issue**: Current policies allow regular users to see their own outbox entries. Per spec, this is a diagnostics-only table — users should use `notifications` (in-app) or wait for Teams delivery.

---

## Schema Discovery

### notification_outbox columns:
| Column | Type | Notes |
|--------|------|-------|
| `id` | uuid | PK, auto-generated |
| `event_type` | enum | Notification type |
| `tenant_id` | integer | Nullable |
| `client_id` | integer | Nullable |
| `record_type` | text | Entity type |
| `record_id` | uuid | Entity ID |
| `recipient_user_uuid` | uuid | Target user |
| `payload` | jsonb | Notification data |
| `status` | enum | queued/sent/failed/skipped |
| `attempt_count` | integer | Retry counter |
| `last_error` | text | Nullable |
| `created_at` | timestamptz | Auto-generated |
| `sent_at` | timestamptz | Nullable |
| `next_retry_at` | timestamptz | Nullable |

---

## Planned Changes

### 1. DROP Existing Policies
Remove 2 existing policies that are too permissive for a diagnostics table.

### 2. CREATE Restrictive Policies

| Operation | Policy Name | Logic |
|-----------|-------------|-------|
| **SELECT** | `notification_outbox_select` | SuperAdmin only |
| **INSERT** | `notification_outbox_insert` | Block authenticated (service role bypasses) |
| **UPDATE** | `notification_outbox_update` | Block authenticated (service role bypasses) |
| **DELETE** | `notification_outbox_delete` | Block authenticated (service role bypasses) |

### 3. Policy Definitions

**SELECT** — SuperAdmin only for diagnostics
```sql
CREATE POLICY "notification_outbox_select"
ON public.notification_outbox
FOR SELECT TO authenticated
USING (public.is_super_admin_safe(auth.uid()));
```

**INSERT** — Block authenticated, service role bypasses RLS
```sql
CREATE POLICY "notification_outbox_insert"
ON public.notification_outbox
FOR INSERT TO authenticated
WITH CHECK (false);
```

**UPDATE** — Block authenticated, service role bypasses RLS
```sql
CREATE POLICY "notification_outbox_update"
ON public.notification_outbox
FOR UPDATE TO authenticated
USING (false)
WITH CHECK (false);
```

**DELETE** — Block authenticated, service role bypasses RLS
```sql
CREATE POLICY "notification_outbox_delete"
ON public.notification_outbox
FOR DELETE TO authenticated
USING (false);
```

---

## Technical Details

### Service Role Bypass
The edge function `process-notification-outbox` uses `SUPABASE_SERVICE_ROLE_KEY` which bypasses RLS entirely. This is the correct pattern for backend-only tables.

### Why Block All Authenticated Operations?
- **INSERT**: Only the trigger or edge function should queue notifications, not direct user calls
- **UPDATE**: Only the processor edge function should update status/retry info
- **DELETE**: Audit trail — completed notifications should be retained or cleaned up via scheduled job

### User Notification Access
Users can still see their notifications via:
1. `notifications` table (in-app notifications) — separate table with appropriate RLS
2. Teams/email delivery — no database access needed

---

## Migration Summary
A single migration will:
1. Drop 2 existing overly-permissive policies
2. Create 4 restrictive policies (SuperAdmin SELECT, block all else for authenticated)

---

## Impact Assessment
- **User access removed** — Was allowing `recipient_user_uuid = auth.uid()`, now blocked
- **SuperAdmin diagnostics preserved** — Can still view outbox for debugging
- **Edge function unaffected** — Service role bypasses RLS
- **Triggers unaffected** — Database triggers also bypass RLS
- **Audit trail protected** — No user deletions possible

