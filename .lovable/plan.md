## Acknowledged constraints (verified against codebase + DB)

- **`send-invitation-email` v501 is untouched.** The CAPS comment block above `formData.append("h:X-Mailgun-Variables", ...)` stays. No `v:NAME` loop. File is not in this PR's diff.
- **Membership tier source = `package_instances` + `packages.package_type='membership'`.** Verified: 9 membership packages exist (M-AM, M-DR, M-DC, M-GR, M-GC, M-RR, M-RC, M-SAR, M-SAC). `tenants.complyhub_membership_tier` is not used.
- **`tenant_users.primary_contact` is unreliable** — bulk UI shows the resolved suggestion AND a per-row Override picker listing every `tenant_users` row, with `primary_contact=true` rows visually flagged.
- **`accept_invitation_v2` writes to `tenant_users`** — `tenant_members` is dormant and not referenced anywhere in this PR.
- **Status vocab on `user_invitations`** is `pending | sent | expired | failed | accepted | revoked`. Never `cancelled`. Verified the table has `revoked_at`, `revoked_reason`, `last_sent_at`, `mailgun_message_id` columns.
- **Verified DB state:** 17 pending rows = 13 on tenant_id=319 (orphan), 2 on tenant_id=7449 (AHMRC), 2 on tenant_id=6372 (Vivacity). Plus 2 accepted + 3 revoked from yesterday's testing — all preserved.

## Pre-flight deviation (you approved)

Extend existing `/manage-invites` (`src/pages/ManageInvites.tsx`, 912 lines, fully functional) instead of building a parallel `/admin/invitations`. New Revoke action + `?launch=1` default filter only.

## Task 1 — Cleanup migration (one-shot)

`supabase/migrations/<timestamp>_pre_launch_invitation_cleanup.sql`:

1. Snapshot every `status='pending'` row into `audit_eos_events` (action `pre_launch_cleanup_snapshot`, `details = to_jsonb(ui)`).
2. UPDATE pending rows where `tenant_id NOT IN (SELECT id FROM tenants)` → `revoked` (reason: orphaned tenant). Expects 13 rows.
3. UPDATE pending rows for `tenant_id=7449` (AHMRC) → `revoked` (reason: re-invite via Monday Superhero batch). Expects 2 rows.
4. UPDATE pending rows for `tenant_id=6372` (Vivacity) → `revoked` (reason: re-invite via separate Vivacity onboarding flow). Expects 2 rows.
5. `DO $$` verification block raises if any pending rows remain after.

All UPDATEs set `status='revoked'`, `revoked_at=now()`, `revoked_reason=...`, `updated_at=now()`. Accepted/revoked rows from yesterday are not touched.

## Task 2 — `bulk-send-invitations` edge function

`supabase/functions/bulk-send-invitations/index.ts`. Default `verify_jwt=false` (auth in code, matches `invite-user`). Imports shared `corsHeaders` from `_shared/cors.ts`.

**Design:** thin orchestrator. Per tenant, calls existing `invite-user` edge function with the caller's Bearer token forwarded so `invited_by` is recorded as the SuperAdmin. Never re-implements the Mailgun send — single code path through `send-invitation-email` v501.

Input:
```json
{
  "tenant_ids": [123, 456],
  "contact_overrides": {
    "123": { "email": "...", "first_name": "...", "last_name": "...", "unicorn_role": "Admin" }
  }
}
```

Per-tenant flow:
1. AuthZ once up front: caller `unicorn_role='Super Admin'` (or `global_role='SuperAdmin'`) — 403 otherwise.
2. Resolve contact: `contact_overrides[tenant_id]` if present, else most-recent `tenant_users.primary_contact=true` row joined to `users`. None → `outcome:'skipped', reason:'no_primary_contact'`.
3. Dedup: skip if a non-revoked/non-expired/non-failed invitation already exists for `(email, tenant_id)` → `reason:'already_invited'`.
4. `supabase.functions.invoke('invite-user', { body: { invite_as:'CLIENT', ... }, headers:{ Authorization } })`.
5. **3-second sleep between invokes** (sequential `await`, not parallel).
6. Tally `sent | skipped | failed` plus per-row details.

Resilience: single failures don't abort. After **5 consecutive failures**, abort remainder; return `partial_failure:true` and `remaining_tenant_ids:[...]` so the operator can resume.

Response shape:
```json
{ "ok": true, "summary": {"sent":53,"skipped":1,"failed":1},
  "details": [{"tenant_id":123,"outcome":"sent","invitation_id":"...","email":"..."}],
  "partial_failure": false, "remaining_tenant_ids": [] }
```

Audit log row in `audit_eos_events` (action `bulk_send_invitations`) with summary + actor + remaining IDs.

## Task 3 — `/admin/bulk-invite` SuperAdmin page

`src/pages/admin/BulkInvite.tsx`, route added to `src/App.tsx` under `ProtectedRoute`. Non-Super-Admin → redirect `/dashboard` with 403 toast.

**Section 1 — Launch list table.** Populated by the prompt's `DISTINCT ON (t.id)` query (run as a chained `supabase.from('tenants')` call with manual joins, or as an RPC if shape forces it). Columns: checkbox · Tenant · Tier (`packages.full_text`) · Suggested Contact (name + email) · Suggested Role · Override button. Rows with no resolvable email render disabled with red "No contact — set one before sending" inline. Default selection = all rows with valid email.

**Override modal:** lists every `tenant_users` row for that tenant joined to `users` (name, email, current `unicorn_role`). Rows with `primary_contact=true` get a "Primary" badge and sort first (cosmetic hint per your note — even though the flag is unreliable). Plus a "Type a new contact" tab (email + first/last + role select restricted to `Admin`/`User`). Selection persists in local `Map<tenant_id, override>`.

Counter at the bottom: "X of N tenants selected for invitation".

**Section 2 — Email preview.** Inline-rendered HTML preview of `unicorn_accept_invite_v1` with variables substituted from the first selected row (no Mailgun preview API call). Plus a "what will happen" callout: count, from, template, expiry, throttle, ETA `N × 3s`.

**Section 3 — Send batch.** Cyan primary CTA "Send N invitations now". Confirm modal requiring "Type SEND" to enable confirm. On confirm → invoke `bulk-send-invitations`. While running, **poll `user_invitations` every 10 seconds** filtered to today's batch (the selected tenant_ids) to update per-row status pills live (queued → sent / skipped / failed) instead of a frozen 3-minute spinner. On completion: success toast + button "View invitations" → `/manage-invites?launch=1`.

Visual: existing SuperAdmin chrome — purple/fuchsia gradient hero header, Anton headline, Calibri body, cyan CTA, Acai accents, Light Purple `#DFD8E8` section backgrounds. Brand tokens used directly.

## Task 4 — Extend `ManageInvites.tsx` (no parallel page)

1. **Per-row Revoke action** (status `pending` or `sent` only): wrapped in `profile?.unicorn_role === 'Super Admin'` so the button **isn't rendered** for non-SuperAdmins (your security note — not just disabled). Prompt for reason in a small dialog → call existing `cancel-invite` edge function (v308, sets `status='revoked'`) → refresh.
2. **`?launch=1` default filter**: when query param is present (linked from BulkInvite success toast), pre-set status filter to show pending+sent and date filter to last 14 days. Banner at top: "Launch week view — showing recent active invitations".
3. Status pill colors aligned with the prompt: pending=yellow, sent=blue, accepted/verified=green, revoked=grey, expired=orange, failed=red.

## Files this PR touches

```
supabase/migrations/<timestamp>_pre_launch_invitation_cleanup.sql   (new, one-shot)
supabase/functions/bulk-send-invitations/index.ts                   (new)
src/pages/admin/BulkInvite.tsx                                      (new)
src/App.tsx                                                         (1 route added: /admin/bulk-invite)
src/pages/ManageInvites.tsx                                         (Revoke action [SuperAdmin-gated] + ?launch=1 filter)
```

## Out of scope (matches prompt)

No secondary contacts. No Academy-only role logic. No follow-up campaign builder. No Mailgun template edits. No schema changes outside the cleanup migration. No touching `cancel-invite`, `resend-invite`, `invite-user`, `send-invitation-email`, `accept_invitation_v2`, `validate_invitation_token`, `admin_fix_invitations`, legacy `accept_invite` RPC, or `tenant_members`.

## Verification I will run after build

1. Apply migration → confirm `SELECT count(*) FROM user_invitations WHERE status='pending'` = 0; spot-check the 13/2/2 rows now `revoked` with the right reason text.
2. Deploy `bulk-send-invitations` and `BulkInvite` page → ready for your three-tenant dry run with `angela+bulktest1/2/3@vivacity.com.au`.
3. Confirm `send-invitation-email` is still on v501 and the file on disk still has the CAPS comment block intact.
