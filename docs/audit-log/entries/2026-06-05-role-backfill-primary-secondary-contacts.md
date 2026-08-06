# Audit: 2026-06-05 — role-backfill-primary-secondary-contacts

**Trigger:** ad-hoc — surfaced during invite flow investigation (Kerry Redrup / HPA Training, Anna-Lee Hamilton / SHCS Academy)
**Scope:** `tenant_users.role` and `tenant_members.role` for all `primary_contact` and `secondary_contact` users platform-wide. No schema changes, no FK changes, no RLS changes — data-only fix.

---

## Findings

- **Root cause:** The May 2025 initial data import populated every `tenant_users` row with `role = 'child'` regardless of `relationship_role`. Primary and secondary contacts should have `role = 'parent'` per the authoritative mapping in `accept_invitation_v2` and `invite-user`. The same import left `tenant_members.role = 'General User'` for all affected rows — should be `'Admin'` for contacts.
- **Scale:** 370 users affected across both tables at the time of fix (335 primary\_contact + 35 secondary\_contact in `tenant_users`; 367 in `tenant_members`).
- **Active exposure:** 6 users had `last_sign_in_at` set — they were actively using the platform with wrong permissions. `hasTenantAdmin()` returned `false` for all of them, blocking any RBAC gate that reads `tenant_members.role = 'Admin'`.
- **Prior fixes did not cover this class:** `2026-05-06-invite-acceptance-tenant-members-fix` backfilled 416 `tenant_members` rows for accepted invites (83 active, 333 inactive). `2026-05-12-contact-role-canonicalisation` backfilled 42 drift rows and rekeyed the trigger. `2026-05-26-bug-041-ghost-user-role-fix-and-activation` confirmed 470 ghost users with 394 primary contacts. None of these swept all `primary_contact` / `secondary_contact` rows — only subsets defined by active invites or specific FK drift.
- **Pattern is uniform:** Every affected row had exactly `role = 'child'` + `tm_role = 'General User'`. No unexpected combinations found in dry-run spot-check across 10 sampled rows from tenant IDs 44 through 1063.
- **Impact on `ClientTenantContext`:** Access was not completely broken — `canAccessClientPortal` and `canManagePortalUsers` both read `relationship_role` + `access_scope`, which were correct. The wrong `role` affected `useAuth.hasTenantAdmin()` (reads `tenant_members.role`), which gates admin-level features.
- **`check_invitation_expiry` trigger** only fires on UPDATE and only acts when `status = 'pending'` — so ghost-activation records (`status = 'sent'`, no `token_hash`) are never auto-expired. Separate architectural gap flagged as open question below.
- **Ghost user invite flow gap confirmed:** `activate-ghost-user` does not run `accept_invitation_v2`, leaving roles uncorrected at activation time. Roles are now correct via this backfill, but future activations will reintroduce the problem until the edge function is patched (tracked below).

---

## DB changes applied (direct SQL — no migration file)

Applied directly via Supabase MCP `execute_sql` (service role):

```sql
-- Statement 1: 369 rows updated
UPDATE tenant_users
SET role = 'parent'
WHERE relationship_role IN ('primary_contact', 'secondary_contact')
  AND role != 'parent';

-- Statement 2: 367 rows updated
UPDATE tenant_members tm
SET role = 'Admin', updated_at = now()
FROM tenant_users tu
WHERE tu.user_id = tm.user_id
  AND tu.tenant_id = tm.tenant_id
  AND tu.relationship_role IN ('primary_contact', 'secondary_contact')
  AND tm.role != 'Admin';
```

Post-fix verification:
- `remaining_wrong_tu = 0` ✅
- `remaining_wrong_tm = 0` ✅
- Kerry Redrup (`admin@hpatraining.com.au`, tenant 6278): `tu_role = parent`, `tm_role = Admin` ✅
- Anna-Lee Hamilton (`anna-lee@sydneyhealthcare.net.au`, tenant 7408): `tu_role = parent`, `tm_role = Admin` ✅

---

## KB changes shipped

- no changes — this session was investigation + direct DB fix only

---

## Codebase observations (read-only)

- unicorn-cms-f09c59e5 @ `7b9bd171`: `activate-ghost-user` edge function does not run `accept_invitation_v2` or apply the role mapping. Future ghost activations will re-introduce `role = 'child'` / `General User` for any user activated via that path. Fix requires a Lovable prompt (tracked in open questions).
- `validate_invitation_token` and `accept_invitation_v2` both require `status = 'pending'`. Ghost-activation records are inserted with `status = 'sent'` and no `token_hash` — they can never be accepted through the invite acceptance flow. These records stay `status = 'sent'` indefinitely (trigger only acts on `'pending'`).
- `resend-invite` has no `frontendOrigin` fallback — if `origin` and `referer` headers are absent, the copy-link path returns `undefined/accept-invitation?token=...`.
- 62 true ghost users (no auth account, no active invite) remain unactivated as of this session.
- 36 ghost-activation `user_invitations` records with `token_hash IS NULL` and `status = 'sent'` remain — all have auth accounts (created by `activate-ghost-user`), roles now correct via this fix.

---

## Decisions

- n/a — data-only fix, no architectural decisions required for this specific backfill.

---

## Open questions parked

- **`activate-ghost-user` role correction:** Edge function must apply the same `CASE v_relationship_role` mapping as `accept_invitation_v2` immediately after `auth.admin.createUser()`. Requires Lovable prompt. Until deployed, any new ghost activation will re-introduce wrong roles and must be manually corrected or re-run after the fix ships.
- **Ghost activation invite mechanism:** `activate-ghost-user` sends a 1-hour Supabase recovery link instead of a 7-day custom invite token. This means `accept_invitation_v2` never runs for ghost users regardless of role correction. Proposed fix: create proper `user_invitations` record with `token_hash` and send standard invite email. Requires `set-invite-password` edge function to handle the "auth account exists, no password" case on `AcceptInvitation.tsx`.
- **62 unactivated ghosts:** Need to be activated via `bulk-account-actions` once code fixes are deployed.
- **`resend-invite` URL fallback:** `frontendOrigin` has no hardcoded fallback — returns `undefined/accept-invitation?...` if `origin`/`referer` headers are absent. Low-risk Lovable fix.

---

## Tag
audit-2026-06-05-role-backfill-primary-secondary-contacts
