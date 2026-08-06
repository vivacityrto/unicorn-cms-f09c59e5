# Audit: 2026-06-04 — Invitation Flow & Cohort Sender Bug Fixes

**Date:** 04 June 2026
**Author:** Khian (Brian)
**Type:** Bug fixes — Lovable production DB change session
**Repos touched:** `unicorn-cms-f09c59e5` (Lovable), `unicorn-audit` (this file)

---

## Context

Follow-on session to the 03 June invitation flow work. Began with a live support investigation for Kerry Redrup (HPA Training) who could not log in. Diagnosis revealed a systemic redirect URL bug affecting all four password reset / account activation edge functions. Fixing that unblocked cohort sender testing, which in turn revealed three more blocking bugs in the cohort sender itself. All bugs fixed and smoke tested in session.

---

## Support Investigation — Kerry Redrup (admin@hpatraining.com.au)

### Findings

| Field | Value |
|---|---|
| Invite record | Exists — sent by angela@vivacity.com.au on 29 May 2026 |
| `auth.users` created | 29 May 2026 — NOT a ghost account |
| `email_confirmed_at` | 29 May 2026 (auto-confirmed by Supabase) |
| `last_sign_in_at` | 3 June 2026, 14:13 AEST — already signed in |
| `user_invitations.status` | Still `sent` — acceptance flow does not update this row |
| Mailgun | Delivered → Opened → Clicked (×2) on 2 June |

Kerry's invite acceptance flow completed but `user_invitations.status` was never updated to `accepted` — cosmetic DB state issue only. Kerry had full access. Resolution: password reset email sent on 3 June; Mailgun confirmed Delivered → Opened. Kerry confirmed signed in.

### Clarifications documented

- `user_invitations.delivery_status` is NULL for both Kerry and Hoon because the Mailgun webhook fires on a separate domain (`rto.complyhub.ai`) and the matching uses `mailgun_message_id`, which the original invite did not capture. Not a bug — gap in historic records only.
- **Activate ghost user vs send password reset:** `activate-ghost-user` creates the `auth.users` account first, then sends the email. If a user never clicks the activation link, the auth account already exists — resend via `send-password-reset`, not `activate-ghost-user` (which would return 409 ALREADY_ACTIVATED).
- **Invitation vs password reset expiry:** invitation links = 7 days (app-controlled); activation + password reset links = 1 hour (Supabase hardcoded).

---

## Changes

### 1 — Bug Fix: Password reset redirect URL (send-password-reset)

**File:** `supabase/functions/send-password-reset/index.ts`

**Root cause:** Line 153 read `const origin = req.headers.get("origin")`. When called from the Unicorn app, the origin resolved to `https://vivacity.au` (the Vivacity marketing site). Supabase's `generateLink()` used this as the `redirectTo`, so users clicking the link landed on a 404 at `vivacity.au/reset-password`.

**Fix:** Replaced with `const APP_BASE_URL = Deno.env.get("APP_BASE_URL") || "https://www.unicorn-cms.au"`. Updated `redirectTo` and email footer to use `APP_BASE_URL`.

**Environment:** `APP_BASE_URL=https://unicorn-cms.au` added to Supabase edge function secrets.

**Smoke test:** `khian+resetpass@complyhub.ai` invited to Demo RTO, invite accepted, password reset sent — link correctly landed on `unicorn-cms.au/reset-password`. ✅

---

### 2 — Bug Fix: Same redirect bug in three more edge functions

**Files:**
- `supabase/functions/generate-recovery-link/index.ts` (line 120, 126)
- `supabase/functions/activate-ghost-user/index.ts` (lines 134, 138, 188)
- `supabase/functions/send-self-password-reset/index.ts` (lines 84, 91, 165)

All three had the same `req.headers.get("origin")` pattern for `redirectTo`. Also fixed the email footer links in `activate-ghost-user` and `send-self-password-reset` which also referenced `${origin}`.

**Fix applied:** Same `APP_BASE_URL` env var pattern as Fix 1. `APP_BASE_URL` already set in Supabase secrets from Fix 1 — no additional env config needed.

---

### 3 — Bug Fix: ReInviteDialog calling wrong edge function

**Files:** `src/components/admin/ReInviteDialog.tsx`, `src/pages/ManageInvites.tsx`

**Root cause:** The Re-invite dialog was calling `invite-user` (which creates new invitations and requires full payload: `first_name`, `unicorn_role`, `invite_as`, etc.). The dialog only provided `email` + `tenant_id` → 422 `INVALID_PAYLOAD`. The correct function is `resend-invite`, which takes only `{ invitation_id }`.

**Fix:** Replaced the dropdown-based UI and `invite-user` call with a read-only confirmation list of selected invitations. Submit handler now calls `resend-invite` with `invitation_id` per selected row via `Promise.allSettled`. Partial success (some sent, some failed) handled with a warning toast.

**Also fixed:** `expectedConfirm` in `CohortAccessSender.tsx` was generating mixed-case text (`"Send to 1 people"`) but the UI label displayed uppercase via CSS. The string comparison was case-sensitive so the Launch job button could never be enabled. Fixed: `expectedConfirm` now generates `"SEND TO ${n} PEOPLE"`.

---

### 4 — Bug Fix: launch_cohort_job — audit_eos_events NOT NULL crash

**Migration:** `20260603072842_7d617378-c4a5-4446-b65c-d2816b38adbd.sql`

**Root cause:** `launch_cohort_job` inserted into `audit_eos_events` without `tenant_id`, which has a NOT NULL constraint. Job launch failed at the audit step.

**Fix:** Added `tenant_id = 6372` (Vivacity tenant — convention for cross-tenant staff operations) to the INSERT. Existing function body otherwise unchanged.

---

### 5 — Bug Fix: Cohort worker — auth.uid() NULL in edge function RPC context

**Migration:** `20260603233346_f36f9df9-9e39-47b2-871f-1244298cb4ea.sql`

**Root cause:** Four DB functions called via `userClient.rpc()` inside the edge function used `is_vivacity_staff(auth.uid())` for the staff check. `auth.uid()` returns NULL in the edge function's RPC context (PostgREST does not set `auth.uid()` from the JWT when called via the Supabase client with ANON_KEY + custom Authorization header in this pattern). All four functions threw FORBIDDEN → worker aborted silently → job stuck at `remaining: 1` forever with `attempts = 0`.

**Functions fixed:**

| Function | Change |
|---|---|
| `lease_cohort_job_items` | Added `p_caller_id uuid DEFAULT NULL`; staff check uses `COALESCE(p_caller_id, auth.uid())` |
| `record_cohort_item_outcome` | Same |
| `finalise_cohort_job` | Same; `v_caller uuid := COALESCE(p_caller_id, auth.uid())` |
| `set_cohort_job_status` | Same; `DEFAULT NULL` required — frontend calls this directly without `p_caller_id` |

**Worker fix (`supabase/functions/cohort-access-sender-worker/index.ts`):** All four `userClient.rpc()` calls updated to pass `p_caller_id: caller.id` explicitly.

**Also in this migration:**
- `finalise_cohort_job` INSERT into `audit_eos_events` also lacked `tenant_id` (same NOT NULL crash as Fix 4). Added `tenant_id = 6372`.
- `payload` variable was declared inside the `try` block but referenced outside it (JavaScript scoping error). `action_link` was never stored. Fixed: hoisted `let payload: any = undefined` above the try block.
- Drain loop in `CohortAccessSenderJob.tsx` did not check the `aborted` field from the worker response, creating an infinite retry loop when the worker failed. Fixed: reads `aborted` from response; shows destructive toast and breaks loop if truthy.

---

### 6 — Bug Fix: Old function overloads caused PostgreSQL ambiguity

**Migration:** `20260603234625_bb99d201-337e-42aa-b802-da316efa68c1.sql`

**Root cause:** `CREATE OR REPLACE FUNCTION` with a new parameter creates a new overload rather than replacing the old signature. All four functions from Fix 5 now had two versions in `pg_proc`. PostgreSQL raised `42702: could not choose best candidate function` when callers omitted `p_caller_id`.

**Fix:** Dropped the old (shorter) signatures:
```sql
DROP FUNCTION IF EXISTS public.set_cohort_job_status(uuid, text);
DROP FUNCTION IF EXISTS public.lease_cohort_job_items(uuid, text, integer);
DROP FUNCTION IF EXISTS public.record_cohort_item_outcome(bigint, text, text);
DROP FUNCTION IF EXISTS public.finalise_cohort_job(uuid);
```

---

### 7 — Bug Fix: lease_cohort_job_items — ambiguous id column reference

**Migration:** Applied via Lovable post-session (latest migration in codebase).

**Root cause:** `lease_cohort_job_items` is declared `RETURNS TABLE(id bigint, ...)`. In PL/pgSQL, this creates an output variable named `id`. The function body contained:

```sql
IF NOT EXISTS (
  SELECT 1 FROM public.cohort_send_jobs
  WHERE id = p_job_id AND status = 'running'
) THEN
```

PostgreSQL resolved `id` to the PL/pgSQL output variable (always NULL at that point), not the table column. The condition was always true (NOT EXISTS of NULL = true), so the function returned immediately with 0 rows on every call. This bug predates all other fixes — `lease_cohort_job_items` had never successfully leased an item.

**Fix:** Aliased the table reference:

```sql
IF NOT EXISTS (
  SELECT 1 FROM public.cohort_send_jobs csj
  WHERE csj.id = p_job_id AND csj.status = 'running'
) THEN
```

---

### 8 — Ghost user 3 created (Demo RTO smoke test)

`brian+ghostuser3@vivacity.com.au` inserted directly via SQL into `public.users` + `tenant_users` for Demo RTO (tenant 7547). No `auth.users` row — confirmed ghost state.

---

## Migrations

| Migration file | Description |
|---|---|
| `20260603072842_7d617378` | `launch_cohort_job`: add `tenant_id = 6372` to audit insert |
| `20260603233346_f36f9df9` | 4 cohort functions: `p_caller_id` param; `finalise_cohort_job` tenant_id fix |
| `20260603234625_bb99d201` | Drop old function overloads (ambiguity resolution) |
| Latest (lease alias fix) | `lease_cohort_job_items`: qualify `cohort_send_jobs.id` with alias `csj` |

---

## Edge Functions

| Function | Change |
|---|---|
| `send-password-reset` | `redirectTo` uses `APP_BASE_URL` env var; footer link fixed |
| `generate-recovery-link` | Same redirect fix |
| `activate-ghost-user` | Same redirect fix + footer link |
| `send-self-password-reset` | Same redirect fix + footer link |
| `cohort-access-sender-worker` | Pass `p_caller_id: caller.id` to all 4 RPCs; payload scoping fix |

---

## Frontend

| File | Change |
|---|---|
| `src/components/admin/ReInviteDialog.tsx` | Replaced dropdowns with read-only list; calls `resend-invite` with `invitation_id` |
| `src/pages/ManageInvites.tsx` | Updated `ReInviteDialog` props to pass `selectedInvites` |
| `src/pages/admin/CohortAccessSender.tsx` | `expectedConfirm` now uppercase to match CSS-transformed UI label |
| `src/pages/admin/CohortAccessSenderJob.tsx` | Drain loop: read `aborted` field, break + toast on failure |

---

## Smoke Tests

| Test | Result |
|---|---|
| Password reset to `khian+resetpass@complyhub.ai` | Link landed correctly on `unicorn-cms.au/reset-password` ✅ |
| Password reset to Kerry Redrup (admin@hpatraining.com.au) | Delivered → Opened (Mailgun confirmed) ✅ |
| Re-invite dialog (admin@hpatraining.com.au) | Called `resend-invite` correctly; no 422 ✅ |
| Cohort sender Launch job (SEND TO 1 PEOPLE) | Button enabled on uppercase match ✅ |
| Cohort job `05416fab`: activate brian+ghostuser2@vivacity.com.au | Completed: 1 sent, 0 failed ✅ |
| Activation email received | Confirmed in inbox ✅ |

---

## Key Decisions

- **`APP_BASE_URL` = `https://unicorn-cms.au`** — set in Supabase edge function secrets. All password reset and activation links now use this. If the app domain changes, update this secret — no code change needed.
- **`tenant_id = 6372` for cross-tenant audit events** — Vivacity tenant is the convention for staff-level operations that span multiple client tenants. Applied to `launch_cohort_job` and `finalise_cohort_job`.
- **`p_caller_id DEFAULT NULL` with COALESCE** — preserves backward compatibility for frontend callers that call `set_cohort_job_status` directly (Pause/Cancel buttons). Worker always passes explicit UUID; frontend relies on `auth.uid()` which works for direct DB calls.

---

## Open Items

- `brian+ghostuser3@vivacity.com.au` created in Demo RTO — not yet activated via cohort sender. Ready for next demo run.
- Progress bar UX improvement noted: cohort job page should show a live step indicator so staff can distinguish "working slowly" from "stuck". Logged as a future Lovable prompt.
- `user_invitations.status` is never updated to `accepted` on invitation completion — cosmetic issue only, does not affect access. Flagged but not fixed this session.

---

## Codebase at Close

`unicorn-cms-f09c59e5 @ 721e956d`

---

## Tag

audit-2026-06-04-invitation-cohort-fixes
