## Plan: Mailgun delivery webhook + Manage Invites delivery status

The migration adding `delivery_status` and `delivery_event_at` to `user_invitations` has already been approved and applied.

### 1. New edge function — `supabase/functions/mailgun-webhook/index.ts`

- Public POST, no JWT. Add `[functions.mailgun-webhook] verify_jwt = false` to `supabase/config.toml`.
- CORS preflight returns 200.
- Always returns `200 { ok: true }` so Mailgun never retries.
- Uses service-role client to bypass RLS.

Signature verification (runs first if `MAILGUN_WEBHOOK_SIGNING_KEY` secret is present):
- HMAC-SHA256 over `timestamp + token` using the signing key.
- Hex-compare against `body.signature.signature`; mismatch → log and return 200 (no processing).
- If secret missing, log a warning and continue (no enforcement yet).

Event processing:
1. Parse JSON body.
2. Read `event-data.event`, `event-data.severity`, `event-data.message.headers["message-id"]`, `event-data.timestamp`.
3. Strip surrounding `<…>` from message-id.
4. Map:
   - `delivered` → `delivered`
   - `failed` + `permanent` → `bounced`
   - `failed` + `temporary` → `failed`
   - `complained` → `complained`
   - else → log + 200.
5. Lookup `user_invitations` by `mailgun_message_id`. Not found → log + 200.
6. Update `delivery_status` + `delivery_event_at = to_timestamp(timestamp)`.
7. `console.log` outcome.

No other tables touched, no emails sent, no other functions invoked.

### 2. Frontend — `src/pages/ManageInvites.tsx`

- Extend `InviteRow` with `delivery_status?: 'delivered' | 'bounced' | 'failed' | 'complained' | null` and `delivery_event_at?: string | null`. Existing `select("*")` already returns the columns.
- Add `import { useRBAC } from "@/hooks/useRBAC"` and `const { isVivacityTeam } = useRBAC();` next to the existing `useAuth()` call.
- Status cell: wrap the existing badge in `flex flex-col gap-1`. When `delivery_status` is set and not `delivered`, render a second compact badge:
  - `bounced` → `destructive` variant, `AlertCircle`, "Bounced"
  - `failed` → `warning` variant, `AlertCircle`, "Delivery failed"
  - `complained` → `destructive` variant, `AlertCircle`, "Spam report"
- Actions column: widen the outer header + cell guard from `isSuperAdmin` to `isSuperAdmin || isVivacityTeam`.
- Inside the cell, compute:
  ```ts
  const canRevoke = (invite.status === 'sent' || invite.status === 'pending')
    && !isVerified && isSuperAdmin;
  const canCopyLink = (invite.status === 'sent' || invite.status === 'pending')
    && !isVerified
    && (isSuperAdmin || isVivacityTeam)
    && (isSuperAdmin || invite.delivery_status === 'bounced' || invite.delivery_status === 'failed');
  ```
  Render Revoke and/or Copy link inside the existing `flex items-center gap-2 justify-center` wrapper; when neither applies, render the em-dash. When only Copy link applies (Vivacity Team on a bounced/failed row), render Copy link alone — no em-dash beside it.

Untouched: Revoke logic, AlertDialogs, Re-invite dialog, Delete dialog, stat cards, filters, search, pagination, realtime subscription, `getTimeRemaining`, `getStatusBadge`, fetch query, row data hooks.

### 3. Post-ship
Register webhook in Mailgun (Sending → Webhooks, Domain-level) for `delivered`, `failed`, `complained` at:
```
https://yxkgdalkbrriasiyyrwk.supabase.co/functions/v1/mailgun-webhook
```
Optionally add the `MAILGUN_WEBHOOK_SIGNING_KEY` secret from Mailgun → Sending → Webhook signing key to enforce signature verification.
