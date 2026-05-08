## Fix: Allow primary contact invitations when none exists

**File:** `supabase/functions/invite-user/index.ts` (lines 205–254 only)

### Problem
The current `relationship_role` allowlist excludes `primary_contact` unconditionally and returns `RELATIONSHIP_ROLE_NOT_ALLOWED` referencing a transfer flow that doesn't exist. This blocks assigning the first primary contact to any new tenant.

### Change
Replace the validation block (lines 205–254) with logic that:

1. Allows `primary_contact` in the `allowedRR` list alongside `secondary_contact`, `user`, `academy_user`.
2. For `primary_contact`, enforces uniqueness by checking:
   - `tenant_users.relationship_role = 'primary_contact'` → 409 `PRIMARY_CONTACT_TAKEN`
   - `user_invitations` pending, non-revoked, non-expired with `relationship_role = 'primary_contact'` → 409 `PRIMARY_CONTACT_PENDING`
3. Preserves existing `secondary_contact` uniqueness checks unchanged.

Uniqueness is checked against the `relationship_role` column (not the legacy `primary_contact` boolean, which is unreliable due to a trigger).

### Out of scope (do not modify)
- Any frontend files (`TenantInviteDialog`, `AdminInviteUserDialog`, `useInviteMutations`)
- Other edge functions (`resend-invite`, `cancel-invite`, `bulk-send-invitations`, `accept_invitation_v2`)
- Database migrations — `primary_contact` is already a valid enum value

### Verification
- Inviting first primary contact on a tenant with none → succeeds
- Second primary contact attempt → 409 `PRIMARY_CONTACT_TAKEN`
- While a pending primary invite exists → 409 `PRIMARY_CONTACT_PENDING`
- Secondary contact behavior unchanged
