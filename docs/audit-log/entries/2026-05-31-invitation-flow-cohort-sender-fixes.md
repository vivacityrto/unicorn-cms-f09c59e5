# Audit: 2026-05-31 — Invitation Flow & Cohort Sender Fixes

**Date:** 31 May 2026
**Author:** Khian (Brian)
**Type:** Bug fix + Feature hardening — Lovable production DB change session (3 migrations, 4 edge function changes, multiple frontend changes)
**Repos touched:** `unicorn-cms-f09c59e5` (Lovable)

---

## What shipped

### Context

Investigation of the full invitation and user activation flow ahead of public launch. Two core problems identified: (1) ghost users receiving standard invitations got duplicate UUIDs because the invite flow treated them as new users; (2) activation emails blocked by corporate security gateways left staff with no fallback path. The Cohort Access Sender (already built by Angela) solved the UUID problem but had gaps in visibility and reliability.

---

### Fix 1 — Cohort Sender navigation

The Cohort Sender page (`/admin/cohort-sender`) existed and was fully functional but had no navigation link — only reachable via direct URL. Added to the Administration sidebar as a Super Admin-only item.

**Files:** `src/components/DashboardLayout.tsx`

---

### Fix 2 — Manage Invites: three bugs

**Bug A — Expiry timer:** `getTimeRemaining()` calculated expiry as 24 hours from send time. Actual invitation expiry is 7 days. Fixed to 168 hours. Summary card text updated from "Past 24-hour window" to "Past 7-day window".

**Bug B — Ghost users showing as Verified:** The Verified status and count checked whether a user existed in `public.users`. Ghost users already exist there by definition, so all 61 ghost users in the system were incorrectly showing as Verified. Fixed by adding `is_in_auth: boolean` to `UserStatus` and only marking Verified when the user exists in `auth.users`.

**Bug C — Re-invite button invisible:** The button's display logic was inverted — hidden when invitations were selected, shown when nothing was selected. Fixed.

**Files:** `src/pages/ManageInvites.tsx`

---

### Fix 3 — Copy link when activation email is blocked

`activate-ghost-user` generates a recovery link and emails it. If the email is blocked by corporate security, the link was thrown away — staff had no fallback. Two changes:

- **Edge function:** `activate-ghost-user` now returns `action_link` in the response when `email_sent: false` (null when email succeeded).
- **Frontend:** `TenantUsersTab` shows a "Copy link" toast action button when `action_link` is present. Clicking copies to clipboard; clipboard failure surfaces the raw link as a fallback toast.

**Files:** `supabase/functions/activate-ghost-user/index.ts`, `src/components/client/TenantUsersTab.tsx`

---

### Fix 4 — Cohort sender job results: three gaps

**Gap A — Copy link lost in cohort run:** When `activate-ghost-user` runs during a cohort job and email is blocked, `action_link` was discarded. Fixed in three parts:
- Migration: `action_link text` column added to `cohort_send_job_items` (nullable).
- Worker: after recording outcome, if `payload.action_link` is present, writes it to the job item row via service role update.
- Frontend: job results table shows a Copy button per row where `action_link` is set; also included in CSV export.

**Gap B — Tenant names not shown:** Job results showed raw tenant ID numbers. Fixed by fetching tenant names in `refresh()` and displaying names with ID fallback.

**Gap C — Null tenant guard:** Ghost users with no `tenant_id` would cause `activate-ghost-user` to fail with a 400 error and be marked as failed with no clear reason. Worker now checks for null `tenant_id` before calling activate, records outcome as "skipped" with reason "No tenant assigned — cannot activate", and continues. Does not affect the reset action (which does not require `tenant_id`).

**Files:** `supabase/functions/cohort-access-sender-worker/index.ts`, `src/pages/admin/CohortAccessSenderJob.tsx`
**Migration:** `20260531045703` — `ALTER TABLE public.cohort_send_job_items ADD COLUMN IF NOT EXISTS action_link text`

---

### Fix 5 — invite-user skip_email path missing tenant_id

When `invite-user` creates a ghost user via `skip_email: true`, the insert into `public.users` did not include `tenant_id`. This meant the user's home tenant was only recorded in `tenant_users`, not on the user record itself.

`v_auth_user_state` (the view powering the Cohort Sender's user resolution) reads `tenant_id` from `public.users`. Ghost users created via Quick Invite were therefore invisible to the Cohort Sender when filtering by tenant.

Fixed: `tenant_id: payload.tenant_id` added to the skip_email insert. Only the create path; the existing-user path is unchanged.

**Files:** `supabase/functions/invite-user/index.ts`

---

### Fix 6 — v_auth_user_state view: tenant fallback via tenant_users

Even with Fix 5 forward, 22 existing ghost users in the system (imported from Unicorn 1) had `public.users.tenant_id` null but valid tenant links in `tenant_users`. These were invisible to the Cohort Sender.

Updated `v_auth_user_state` with a COALESCE: uses `public.users.tenant_id` as primary source; falls back to a `LIMIT 1` subquery on `tenant_users` ordered by relationship role priority (primary_contact → secondary_contact → user → other, then most recent). One row per user preserved — no duplicate risk.

**Result:** 26 invisible ghosts → 4 remaining (4 are completely orphaned with no RTO link anywhere — need manual investigation). 57 of 61 ghost users now visible to the Cohort Sender.

**Migration:** `20260531065631` — `CREATE OR REPLACE VIEW public.v_auth_user_state` with COALESCE fallback

---

### Smoke test

Test ghost created via Quick Invite (email: `kohevi8846@matkind.com`, tenant: Test RTO A, ID 7517). Confirmed `account_state = 'ghost'` in `v_auth_user_state`. Activated via individual Activate Account button. Post-activation DB check confirmed:
- `account_state = 'active'`
- Auth account created at same UUID as ghost record (no duplicate)
- `email_confirmed_at` set immediately
- `last_sign_in_at` populated 14 seconds after auth creation (user received email, clicked link, set password)

---

## Changes

### Migrations
- `20260531025451` — Cohort Sender schema: `v_auth_user_state` view (original), `cohort_send_jobs`, `cohort_send_job_items`, `resolve_cohort`, `launch_cohort_job`, `lease_cohort_job_items`, `record_cohort_item_outcome`, `finalise_cohort_job`, `set_cohort_job_status`, `reclaim_stale_cohort_locks` RPCs
- `20260531045703` — `ALTER TABLE public.cohort_send_job_items ADD COLUMN IF NOT EXISTS action_link text`
- `20260531065631` — `CREATE OR REPLACE VIEW public.v_auth_user_state` with COALESCE tenant fallback via `tenant_users`

### Edge functions
- `supabase/functions/activate-ghost-user/index.ts` — returns `action_link` when `email_sent: false`
- `supabase/functions/cohort-access-sender-worker/index.ts` — writes `action_link` to job item after activation; null `tenant_id` guard for activate action
- `supabase/functions/invite-user/index.ts` — `tenant_id: payload.tenant_id` added to skip_email insert

### Frontend
- `src/components/DashboardLayout.tsx` — Cohort Sender nav entry
- `src/pages/ManageInvites.tsx` — expiry 7 days, ghost verified fix, re-invite button fix
- `src/components/client/TenantUsersTab.tsx` — copy link toast when activation email blocked
- `src/pages/admin/CohortAccessSenderJob.tsx` — action_link copy button, tenant names, CSV export updated

**Codebase at close:** `unicorn-cms-f09c59e5 @ 76d4a788`

---

## Key decisions made this session

- **COALESCE over view replacement** — Rather than replacing `public.users.tenant_id` as the source entirely (which would produce duplicate rows for multi-tenant users), the view uses COALESCE so existing users are unaffected and only null cases fall back to `tenant_users`. Maintains the one-row-per-user contract.
- **action_link returned only on email failure** — Returning a live recovery token always would expose it unnecessarily. Returning it only when `email_sent: false` scopes exposure to when it is actually needed.
- **Recovery link stored temporarily in cohort_send_job_items** — Token is single-use and expires in 1 hour. Storage is staff-only (service_role ALL, authenticated SELECT with Vivacity staff RLS). Acceptable given the access boundary and time window.
- **Null tenant skipped, not failed** — A ghost user with no RTO link is a data integrity issue, not an activation error. Recording as "skipped" rather than "failed" prevents it from counting toward the circuit breaker and makes the reason visible without triggering a job abort.

---

## Open questions parked

- **4 completely orphaned ghosts** — no `tenant_id` on `public.users`, no row in `tenant_users`. Need manual investigation to identify which RTO they belong to and link them before they can be activated via Cohort Sender. Emails: not retrieved this session.
- **Manage Invites — copy link for pending invitations** — staff still cannot copy an invite link directly from the Manage Invites page for email-blocked users. Requires on-demand link regeneration (similar to generate-recovery-link) rather than stored plaintext. Deferred to separate session.
- **Mailgun webhook integration** — "sent" status in `user_invitations` means Mailgun accepted the email, not that the user received it. Post-delivery blocking by corporate gateways is invisible. Mailgun webhook integration would surface bounce/block events but is a separate piece of work.

## Tag
audit-2026-05-31-invitation-flow-cohort-sender-fixes
