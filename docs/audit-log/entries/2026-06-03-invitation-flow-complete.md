# Audit: 2026-06-03 — Invitation Flow Complete

**Date:** 03 June 2026
**Author:** Khian (Brian)
**Type:** Bug fixes + Feature hardening + New integration — Lovable production DB change session
**Repos touched:** `unicorn-cms-f09c59e5` (Lovable), `unicorn-audit` (this file)

---

## Context

Full audit of the invitation flow ahead of the Angela demo. Work spanned two days (02–03 June 2026) and covered: test data setup, feature additions to the Cohort Sender and Manage Invites, Mailgun webhook integration for delivery visibility, and a series of bug fixes discovered during the audit.

---

## Changes

### 1 — Test user deleted

`brian+usertesting1@vivacity.com.au` (UUID `539c7b1b-9403-4f55-b0a6-54295e8b09f7`) removed from all tables.

Deletion order: `user_invitations` → `tenant_users` → `public.users` → `audit_eos_events` → `auth.users`

---

### 2 — Demo RTO tenant and ghost users created

New tenant **Demo RTO** (ID 7547, slug `demo-rto`) created for Angela demo purposes.

Two ghost users inserted directly via SQL:

| Name | Email | Role | Relationship |
|---|---|---|---|
| Sarah Mitchell | `brian+ghostuser1@vivacity.com.au` | User | primary_contact |
| James Okafor | `brian+ghostuser2@vivacity.com.au` | User | secondary_contact |

Both confirmed `account_state = 'ghost'` in `v_auth_user_state` and visible to the Cohort Sender.

---

### 3 — Cohort Sender: per-row selection in preview

**File:** `src/pages/admin/CohortAccessSender.tsx`

Added per-row checkboxes to the preview table so staff can include or exclude specific users before launching a job. All rows are opted-in by default. The confirmation phrase recalculates as the selection changes, forcing the user to retype it.

**Migration:** Extended `launch_cohort_job` RPC with `p_include_uuids uuid[] DEFAULT NULL`. When provided, the resolved cohort is filtered to only those UUIDs before job items are created. Old 6-arg signature dropped to avoid Postgres ambiguity. Behaviour unchanged when `p_include_uuids` is NULL.

**Migration:** `20260602003554_fb4d53f1-45dc-4761-8486-be6e14076309.sql`

---

### 4 — Manage Invites: Copy link button

**File:** `src/pages/ManageInvites.tsx`

Added a Copy link button in the Actions column (Super Admin only) for pending/sent non-verified rows. When clicked, calls `resend-invite` with `skip_email: true`, receives `action_link` in response, copies to clipboard. On clipboard failure, surfaces the raw link as a fallback toast.

---

### 5 — Mailgun webhook integration

**New edge function:** `supabase/functions/mailgun-webhook/index.ts`

Receives POST events from Mailgun (`delivered`, `failed`, `complained`). Verifies HMAC-SHA256 signature using `MAILGUN_WEBHOOK_SIGNING_KEY` secret. Matches events to `user_invitations` rows by `mailgun_message_id`. Updates `delivery_status` and `delivery_event_at`. Always returns HTTP 200 so Mailgun does not retry.

**Migration:** Added `delivery_status text` and `delivery_event_at timestamptz` columns (both nullable) to `user_invitations`, with index on `delivery_status`.

**Migrations:** `20260602034622_a490dacc-26f0-4e0e-8d0e-a7f7ec098a09.sql` (columns), `20260602005440_67171e68-f37b-4e26-bebe-039e0781fb27.sql` (cohort sender schema)

**Config:** `[functions.mailgun-webhook] verify_jwt = false` added to `supabase/config.toml`.

**Mailgun registration:** Domain-level webhook registered on `rto.complyhub.ai` for `delivered`, `failed`, `complained`, `permanent failure`, `temporary failure`, `spam complaints` events at:
`https://yxkgdalkbrriasiyyrwk.supabase.co/functions/v1/mailgun-webhook`

**Frontend (`src/pages/ManageInvites.tsx`):** Added `delivery_status` and `delivery_event_at` to `InviteRow` type. Added delivery outcome badges (Bounced, Delivery failed, Spam report) on affected rows. Copy link button extended to Vivacity Team (not just Super Admin) when `delivery_status` is `bounced` or `failed`.

---

### 6 — Manage Invites: delivery outcome filter options

**File:** `src/pages/ManageInvites.tsx`

Added three new filter options to the status dropdown: Bounced (`delivery_status = 'bounced'`), Delivery failed (`delivery_status = 'failed'`), Spam report (`delivery_status = 'complained'`). Matching `matchesStatus` conditions and filter button labels added.

---

### 7 — activate-ghost-user: mailgun_message_id capture

**File:** `supabase/functions/activate-ghost-user/index.ts`

Previously the function called Mailgun directly but only checked `mg.ok` — never reading the response body. The `user_invitations` row was inserted without `mailgun_message_id`, so the webhook could not match delivery events back to it.

Fixed: after `mg.ok`, reads `mgResult = await mg.json()`, captures `mgResult?.id`, and passes `mailgun_message_id: mailgunMessageId` into the `user_invitations` insert.

This also fixes the Cohort Sender path since it calls `activate-ghost-user` per user.

---

### 8 — resend-invite: four bug fixes + skip_email support

**File:** `supabase/functions/resend-invite/index.ts`

**Bug 1 — Wrong body to send-invitation-email:**
Was passing `{ email, inviteUrl, userType }`. Fixed to `{ invitation_id, token_plaintext }` as the function's `RequestBody` interface requires.

**Bug 2 — Expiry 24 hours instead of 7 days:**
`Date.now() + 24 * 60 * 60 * 1000` → `Date.now() + 7 * 24 * 60 * 60 * 1000`

**Bug 3 — Wrong VIVACITY_TENANT_ID:**
`319` → `6372`

**Bug 4 — delivery_status not cleared on resend:**
Updated the `user_invitations` update to also set `delivery_status: null` and `delivery_event_at: null` so stale bounce badges are cleared when a fresh email is sent.

**New feature — skip_email support:**
When called with `skip_email: true` (as `handleCopyLink` in ManageInvites already does), the function generates a new token, skips the email send, and returns `action_link` directly. Logs to `audit_eos_events` with action `copy_invite_link`. Does not log to `audit_invites` (no email sent).

---

### 9 — Manage Invites: stat card and filter consistency

**File:** `src/pages/ManageInvites.tsx`

**Bug — Verified stat card and filter used wrong field:**
`stats.verified` was checking `!!userStatus` (presence in `public.users`). Ghost users exist in `public.users` by definition, inflating the verified count. Fixed to `userStatus.is_in_auth === true`.

`matchesStatus` verified filter was checking `email_confirmed_at` which was set to `created_at` from `public.users` — not a real confirmation signal. Fixed to `is_in_auth === true`.

**Bug — Expired invites appeared in pending filter:**
The pending `matchesStatus` condition had no `!isExpired` guard, so expired invites matched both the expired and pending filters simultaneously. Fixed by adding `&& !isExpired` to the pending condition.

`stats.pending` and `stats.expired` also updated to use `is_in_auth` for consistency with the row badge (which was already correct).

---

## Migrations

| Migration | Description |
|---|---|
| `20260602003554` | Cohort Sender schema (already existed from May 31 — confirmed applied) |
| `20260602005440` | `launch_cohort_job` extended with `p_include_uuids uuid[]` |
| `20260602034622` | `user_invitations`: add `delivery_status text`, `delivery_event_at timestamptz`, index |

---

## Edge Functions

| Function | Change |
|---|---|
| `activate-ghost-user` | Capture `mailgun_message_id` from Mailgun response; store on `user_invitations` |
| `resend-invite` | 4 bug fixes + `skip_email` support returning `action_link` |
| `mailgun-webhook` | New — receives Mailgun delivery events, verifies signature, updates `user_invitations` |

---

## Frontend

| File | Change |
|---|---|
| `src/pages/admin/CohortAccessSender.tsx` | Per-row selection in preview table |
| `src/pages/ManageInvites.tsx` | Copy link button; delivery badges; delivery filters; stat card and filter consistency fixes |

---

## Smoke test

Demo RTO (ID 7547) confirmed with 2 ghost users at session close:
- `brian+ghostuser1@vivacity.com.au` — `account_state = ghost` ✓
- `brian+ghostuser2@vivacity.com.au` — `account_state = ghost` ✓

Both visible to Cohort Sender via `v_auth_user_state`. No cohort jobs run (clean slate for demo).

---

## Key decisions

- **MAILGUN_WEBHOOK_SIGNING_KEY added by Carl** — not included in codebase. Verification activates automatically when env var is present; graceful skip with warning when absent.
- **skip_email returns action_link only** — token is generated and stored but no email is sent and no `mailgun_message_id` is recorded (correct — the link was copied, not emailed).
- **delivery_status cleared on resend** — when staff resend, stale bounce data is wiped so the row starts fresh.
- **is_in_auth as the single source of truth** — row badge, stat cards, and filter now all use the same field consistently.

---

## Open items

None remaining from this session. Previous open items from 31 May 2026:
- **4 orphaned ghost users** — no tenant link anywhere. Need manual investigation before they can be activated via Cohort Sender.

---

## Full Invitation Flow — All Paths

### Path 1 — Standard Invite (new user, never been in the system)

1. Staff opens a tenant → Users tab → clicks **Invite User**
2. Fills in name, email, role → submits
3. `invite-user` edge function runs:
   - Creates a row in `public.users` (ghost state)
   - Creates a row in `user_invitations` with a SHA-256 hashed token
   - Calls `send-invitation-email` which sends a branded email via Mailgun and stores the `mailgun_message_id` on the invitation row
4. User receives the email, clicks the link → lands on `/accept-invitation?token=...`
5. They set their name and password → account is fully activated
6. `user_invitations.status` updates to `accepted`

**Mailgun webhook fires** → `delivery_status` updates to `delivered`, `bounced`, or `failed` depending on outcome. Manage Invites shows the badge.

**Link valid for:** 7 days

---

### Path 2 — Activate Account (ghost user, one at a time)

Used for users who were imported from Unicorn 1 or created via Quick Invite — they exist in the system but have no login.

1. Staff opens a tenant → Users tab → sees a ghost user → clicks **Activate Account**
2. `activate-ghost-user` edge function runs:
   - Looks up the ghost in `public.users`
   - Creates an `auth.users` account at the **same UUID** (preserves all their data)
   - Generates a Supabase recovery link (1 hour expiry)
   - Sends a branded welcome email via Mailgun — stores `mailgun_message_id`
   - Creates a row in `user_invitations` for Manage Invites visibility
3. User receives the email, clicks the link → lands on `/reset-password`
4. They set their password → signed in immediately

**If email is blocked:** Edge function returns `action_link` in the response → frontend shows a **Copy link** toast → staff pastes it into Teams/WhatsApp

**Mailgun webhook fires** → `delivery_status` updates in Manage Invites

**Link valid for:** 1 hour (Supabase hardcoded)

---

### Path 3 — Cohort Sender (bulk ghost activation)

Used when you need to activate many ghost users across multiple tenants in one run.

1. Staff goes to **Administration → Cohort Access Sender**
2. Sets filters (account state, tenant, tier, date) → clicks **Preview recipients**
3. Resolved list appears — staff can **check/uncheck individual users** before launching
4. Types the confirmation phrase (e.g. "Send to 9 people") → clicks **Launch job**
5. `launch_cohort_job` RPC creates the job and all job items in the DB
6. The worker (`cohort-access-sender-worker`) drains the queue — calls `activate-ghost-user` per user with a 400ms gap between sends
7. Results appear in the job page — tenant name, outcome per row, Copy link button where email was blocked

**If email is blocked for a user:** `action_link` is stored on the `cohort_send_job_items` row → Copy button appears on that row → staff copies and delivers manually

**Mailgun webhook fires** per user → `delivery_status` updates in Manage Invites for each one

**Link valid for:** 1 hour per user (same as Path 2)

---

### Path 4 — Re-invite (resend to existing invited user)

Used when an invitation expired, was never opened, or the user lost the email.

1. Staff goes to **Manage Invites** → finds the row → selects it → clicks **Re-invite**
2. `resend-invite` edge function runs:
   - Generates a **brand new token** (old one is invalidated)
   - Resets expiry to 7 days from now
   - Clears any previous `delivery_status` (bounce badge disappears — fresh start)
   - Calls `send-invitation-email` with the correct `invitation_id` and `token_plaintext`
   - `send-invitation-email` sends the email and stores the new `mailgun_message_id`
3. User receives the new email, clicks the link → same acceptance flow as Path 1

**Mailgun webhook fires** → new `delivery_status` recorded

**Link valid for:** 7 days

---

### Path 5 — Copy link (email blocked, manual delivery)

Used when staff know or suspect an email did not reach the user — works for both standard invites and ghost activations.

1. Staff goes to **Manage Invites** → finds the row (Bounced/Delivery failed badge, or user reported not receiving)
2. Clicks **Copy link** (visible to Super Admin always; visible to Vivacity Team when `delivery_status` is `bounced` or `failed`)
3. `resend-invite` is called with `skip_email: true`:
   - Generates a new token
   - Resets expiry to 7 days
   - Clears `delivery_status`
   - Does **not** send an email
   - Returns `action_link` directly
4. Frontend copies it to clipboard → toast confirms
5. Staff pastes the link into Teams, WhatsApp, phone call — whatever reaches the user
6. User clicks the link → same acceptance flow as Path 1

**Logged to:** `audit_eos_events` with action `copy_invite_link`

**Link valid for:** 7 days

---

### What Manage Invites shows across all paths

| What happened | Badge shown | Action available |
|---|---|---|
| Email sent, waiting | Sent | Re-invite, Copy link |
| User clicked and registered | Verified | — |
| 7 days passed, not opened | Expired | Re-invite |
| Mailgun hard bounce | Bounced | Re-invite, Copy link |
| Temporary delivery failure | Delivery failed | Re-invite, Copy link |
| Marked as spam | Spam report | Re-invite |
| Revoked by staff | Revoked | — |

---

## Codebase at close

`unicorn-cms-f09c59e5 @ 41118326`

---

## Tag

audit-2026-06-03-invitation-flow-complete
