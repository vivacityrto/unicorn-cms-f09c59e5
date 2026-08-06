# Audit: 2026-06-08 — Invitation & Auth Flow Fixes

**Date:** 08 June 2026
**Author:** Khian (Brian)
**Type:** Bug fixes — Lovable production DB change session
**Repos touched:** `unicorn-cms-f09c59e5` (Lovable), `unicorn-audit` (this file)

---

## Context

Continuation of the invitation / auth flow diagnosis begun on 05 June 2026
(triggered by Kerry Redrup / HPA Training access issue). This session completed
the remaining fixes identified in `InvitationFlowWorkload.md` (workspace root,
local only). Five issues resolved across DB functions, edge functions, and
frontend. All changes verified live in DB and codebase post-pull.

---

## Changes

### 1 — Bug Fix: `users.tenant_id` backfill — 45 client users (DB, direct SQL)

**Root cause:** 48 client users had a null `users.tenant_id` (the "RTO stamp")
even though their membership existed in `tenant_users`. 49 RLS policies across
39 tables read `users.tenant_id` inline to gate access. Null stamp = silent
permission denied on all 39 tables — users could log in but workspace was empty
and broken. Originally documented as 99 affected (an earlier count); live DB
confirmed 48 membership-holding users, 45 of which were single-membership
clients (unambiguous backfill candidates).

**Fix:** Direct SQL backfill applied against Unicorn 2.0-dev:

```sql
UPDATE public.users u
SET tenant_id  = tu.tenant_id,
    updated_at = now()
FROM public.tenant_users tu
WHERE tu.user_id = u.user_uuid
  AND u.tenant_id IS NULL
  AND u.user_type IN ('Client Parent','Client Child')
  AND (SELECT COUNT(*) FROM public.tenant_users x WHERE x.user_id = u.user_uuid) = 1;
-- 45 rows affected
```

Vivacity staff (2) and ghost users (~67, no membership) intentionally excluded.
Brian Cannan (1 user, 2 memberships) passed on — not an issue.

**Verified:** `client_null_with_membership` dropped to 1 (Brian Cannan only);
453 clients now correctly stamped.

**Trigger side-effect:** `update_tenant_status()` fired for each touched tenant —
recalculated active/inactive status. Correct and expected. Audit trigger
(`trg_audit_users_update`) captured all 45 changes.

**Note:** `get_current_user_tenant_id()` cited in prior KB doc as the gating
function — confirmed dead code (no policies reference it). Live policies inline
the read directly. Doc corrected in `InvitationFlowWorkload.md`.

---

### 2 — Bug Fix: `set_relationship_role` missing `users.tenant_id` maintenance

**Migration:** `20260607234919_314ec9b0-2712-40b8-a7e9-5122213a30d4.sql`

**Root cause:** `set_relationship_role` (called from `TenantUsersTab.tsx` when
an admin changes a user's contact role) correctly updated `tenant_users`,
`users.unicorn_role/user_type`, and `tenant_members` — but never wrote
`users.tenant_id`. Every role change via this path left the RTO stamp blank,
causing the same RLS lockout as Fix 1 for any user promoted after initial
activation. This was the recurrence source — without it, Fix 1's backfill would
drift again.

**Fix:** Added one line to the `UPDATE public.users` block:

```sql
tenant_id = COALESCE(tenant_id, p_tenant_id),
```

`COALESCE` preserves any existing stamp (safe for multi-tenant users). Matches
the pattern already used in `accept_invitation_v2`.

**Also fixed in same migration:** The silent `NULL` in the audit subtransaction's
`EXCEPTION WHEN foreign_key_violation` block replaced with `RAISE WARNING` so
ghost-user audit skip events are visible in Postgres logs without aborting the
role change.

**Verified:** Live DB function definition confirmed post-migration. Both changes
present. `SECURITY DEFINER` and `search_path` preserved.

---

### 3 — Bug Fix: Scanner-burn in password reset emails

**Files:**
- `supabase/functions/send-password-reset/index.ts`
- `supabase/functions/send-self-password-reset/index.ts`

**Root cause:** Both functions embedded the raw GoTrue recovery link
(`supabase.co/auth/v1/verify?token=...`) directly in the email HTML. Corporate
mail scanners (Outlook Safe Links, AV) silently open every link on delivery,
consuming the one-time token before the client clicks. `ResetPassword.tsx` has a
2.5-second timer — if `PASSWORD_RECOVERY` event doesn't arrive it shows
"Invalid or expired link" and redirects to login. Token supersession (multiple
rapid resets killing prior tokens) compounded the problem.

**Evidence:** Kerry Redrup (`admin@hpatraining.com.au`) had 5 reset requests in
18 minutes on 05 June, each superseding the previous. Auth audit log confirmed
`user_recovery_requested` events with no successful login between them.

**Fix:** Server-side token transform added in both functions after the
`action_link` null-guard:

```typescript
const actionUrl = new URL(resetLink);
const rawToken = actionUrl.searchParams.get('token');
if (!rawToken) {
  return new Response(JSON.stringify({ ok: false, code: "TOKEN_EXTRACT_FAILED" }), { status: 500 ... });
}
const safeResetLink = `${APP_BASE_URL}/activate?token=${encodeURIComponent(rawToken)}&type=recovery&email=${encodeURIComponent(targetUser.email)}`;
```

All `resetLink` references in email HTML replaced with `safeResetLink`. Stale
"expires in 1 hour" copy updated to "expires in 24 hours" (OTP expiry confirmed
86400s in dashboard — existing copy was stale from an earlier setting).

**Verified:** `ActivateAccount.tsx` confirmed to pass `type` through correctly to
GoTrue. `APP_BASE_URL` already available in both functions.

**Smoke test:** `brian+resettest@vivacity.com.au` created in Demo RTO (tenant
7547), activated via `/accept-invitation`, password reset sent — email arrived
with `/activate` link (not raw GoTrue), full flow completed, `last_sign_in_at`
updated to 08 Jun 00:53. ✅

---

### 4 — Bug Fix: Misleading "welcome email could not be sent" toast

**File:** `supabase/functions/activate-ghost-user/index.ts`

**Root cause:** `activate-ghost-user` returned `invite_sent: emailSent` in its
JSON response. `TenantUsersTab.tsx` read `data.email_sent` (different field
name). `data.email_sent` was always `undefined` → always falsy → "welcome email
could not be sent" toast fired on every activation, including when Mailgun
successfully delivered the email. Confirmed with Erin Jobson (`erin@aia.edu.au`,
AIA, tenant 7508): Mailgun showed Delivered + gsmtp response, but toast said
"could not be sent".

**Also found:** frontend checked `data.action_link` for a "Copy link" toast
action — backend never returned this field. The copy-link button in the toast
was dead code, unreachable.

**Fix:** Renamed `invite_sent` → `email_sent` in both return paths of
`activate-ghost-user`. No frontend change needed — `TenantUsersTab.tsx` already
used the correct field name.

**Verified:** Codebase post-pull confirms `email_sent: emailSent` on lines 255
and 271.

---

### 5 — Bug Fix: `ghost_activation` flag never cleared after activation

**File:** `supabase/functions/set-invite-password/index.ts`

**Root cause:** `activate-ghost-user` creates a bare auth account with
`ghost_activation: true` in user metadata (no password). After the user
completes `/accept-invitation` and sets their password via `set-invite-password`,
the flag was never cleared. It stayed `true` indefinitely — making it impossible
to distinguish a genuinely-incomplete ghost from a fully-activated user in the
DB, and leaving a theoretical security gap where a stale invite token could
re-trigger the ghost password path on an already-active account.

**Fix:** After the successful `updateUserById` password set, added a best-effort
metadata update:

```typescript
try {
  await admin.auth.admin.updateUserById(authUser.id, {
    user_metadata: { ghost_activation: false },
  });
} catch (clearErr) {
  console.warn("Failed to clear ghost_activation flag (non-fatal)", clearErr);
}
```

Wrapped in `try/catch` — failure logs a warning but never aborts the 200 OK
response. `NOT_GHOST_ACCOUNT` guard logic left unchanged.

**Verified:** `ghost_activation` confirmed set in `activate-ghost-user` (line
121) and read in `set-invite-password` (line 109) — no other consumers.
Codebase post-pull confirms `ghost_activation: false` on line 148, `clearErr`
warning on line 151.

---

## Migrations

| Migration file | Description |
|---|---|
| `20260607234919_314ec9b0` | `set_relationship_role`: add `tenant_id = COALESCE(tenant_id, p_tenant_id)`; replace silent NULL with `RAISE WARNING` in audit exception |

---

## Edge Functions

| Function | Change |
|---|---|
| `send-password-reset` | Server-side `/activate` URL transform; stale "1 hour" copy fixed to "24 hours" |
| `send-self-password-reset` | Same |
| `activate-ghost-user` | `invite_sent` → `email_sent` field rename in response JSON |
| `set-invite-password` | Clear `ghost_activation: false` after successful password set (best-effort) |

---

## Smoke Tests

| Test | Result |
|---|---|
| Backfill: `client_null_with_membership` post-update | Dropped to 1 (Brian Cannan only) ✅ |
| `set_relationship_role` live DB function definition | `COALESCE` line + `RAISE WARNING` both present ✅ |
| Password reset to `brian+resettest@vivacity.com.au` (Demo RTO) | `/activate` link in email; full flow completed; `last_sign_in_at` updated 08 Jun 00:53 ✅ |
| Erin Jobson (`erin@aia.edu.au`) activation | Mailgun: Accepted + Delivered (gsmtp) 06 Jun 2026 ✅ |

---

## Key Decisions

- **`users.tenant_id` is load-bearing for RLS, not `get_current_user_tenant_id()`** —
  the function is dead code. 49 policies across 39 tables inline the read
  directly. Documented in `InvitationFlowWorkload.md`.
- **Backfill excludes Vivacity staff** — staff access is gated by
  `is_vivacity_team_safe()`, not `users.tenant_id`. Stamping staff with a single
  tenant could confuse the frontend workspace picker without improving access.
- **`COALESCE` not plain assignment in `set_relationship_role`** — preserves
  existing stamp for multi-tenant users. Consistent with `accept_invitation_v2`.
- **"Send password reset" is for fully-activated users only** — ghost/incomplete
  users must go through "Activate accounts" → `/accept-invitation`. Documented
  in `InvitationFlowWorkload.md` two-flow analysis.
- **OTP expiry already 86400 (24h)** — confirmed in dashboard. Stale "1 hour"
  copy in email templates was incorrect; corrected in Fix 3.

---

## Open Items

- **Phase 1 Step 4:** Lovable prompt to remove Tenant Parent/Child options from
  AdminActions "Role Type" dropdown — now unblocked (depends on Fix 2, now done).
  Ready to go next session.
- **Phase 3:** CohortAccessSenderJob `action_link` source not yet verified;
  29-May expired invite batch not yet resent; Mailgun webhook delivery status
  not yet confirmed (item 6 in workload doc).
- **Token supersession (item 8):** operational only — send one link, wait,
  resend only if confirmed not received.
- **`last_sign_in_at` misleading signal (item 0):** optional observability
  improvement — no action taken.

---

## Codebase at Close

`unicorn-cms-f09c59e5 @ 0324283e`

---

## Tag

audit-2026-06-08-invitation-auth-flow-fixes
