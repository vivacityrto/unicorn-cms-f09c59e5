

# Enable Complete User Management Within Unicorn 2.0

## Problem Summary

Currently, when Vivacity team members encounter login issues, the only reliable fix is manual intervention in the Supabase dashboard. This creates an operational burden and defeats the purpose of Unicorn 2.0 as a self-contained system.

The root causes are:

1. **UUID Mismatches**: When auth users are deleted and recreated (password resets, magic links), the new UUID does not sync to `public.users`, causing "User not found" errors
2. **Missing Tenant Memberships**: Accepted invitations do not always create entries in `tenant_members`, breaking the RBAC system
3. **No Admin Repair Tools**: SuperAdmins have no UI to diagnose and fix these issues from within Unicorn

## Current Architecture Review

| Component | Status | Notes |
|-----------|--------|-------|
| `invite-user` Edge Function | Working | Sends invitations via Mailgun |
| `AcceptInvitation.tsx` | Working | Handles new user signup from invite link |
| `send-self-password-reset` Edge Function | Working | Sends reset emails via Mailgun |
| `handle_new_auth_user` trigger | Fixed (today) | Now handles email conflicts correctly |
| `handle_new_user` trigger | Fixed (today) | Now syncs UUID by email lookup |
| `sync_last_sign_in` trigger | Added (today) | Syncs login timestamps |
| `users_tenant_id_fkey` constraint | Added (today) | Enables tenant joins |
| `tenant_members` creation on invite accept | Gap | Not reliably created |
| Admin User Repair UI | Missing | SuperAdmins must use Supabase directly |

## Solution Overview

The plan addresses the remaining gaps to ensure users can be fully managed within Unicorn 2.0:

### Phase 1: Fix Tenant Membership Creation on Invitation Accept

When a user accepts an invitation, they should automatically be added to `tenant_members`. Currently this happens inconsistently.

**Changes Required:**

1. Modify `AcceptInvitation.tsx` to call a new `accept-invitation` edge function (or use RPC)
2. The edge function will:
   - Validate the invitation token
   - Create the auth user if needed (via `signUp`)
   - Ensure `public.users` record exists with correct UUID
   - Create `tenant_members` entry with role from invitation
   - Mark invitation as `accepted`
3. Add audit logging for the full flow

### Phase 2: Add Admin User Repair Tool in UI

SuperAdmins already have access to `/admin/user-audit` which calls the repair functions created in migration `20260106041046`. However, this page needs:

**UI Improvements:**
- Display diagnostic counts from `audit_summary()`
- Show actionable lists from each `audit_*` function
- Provide buttons to run `admin_fix_*` functions with dry-run preview
- Add ability to manually re-sync a specific user's UUID

### Phase 3: Ensure Login Recovery Works End-to-End

The self-service password reset via `send-self-password-reset` already works. The remaining issue is that when a password reset triggers a new auth user creation (rare but possible), the triggers must sync everything correctly.

**Validation Checklist:**
- Password reset for existing user: No new auth user created, just password change
- Magic link for existing user: No new auth user created
- Password reset for deleted auth user: New auth user created, triggers sync UUID

The trigger fixes deployed earlier today should handle these cases. Testing is required.

## Implementation Details

### 1. AcceptInvitation Edge Function or Enhanced Frontend

**Option A: Keep frontend-only approach (simpler)**
- Enhance `AcceptInvitation.tsx` to call an RPC function that handles membership creation
- The RPC ensures atomicity

**Option B: Create dedicated edge function (more robust)**
- Move all acceptance logic to server-side for better error handling
- Frontend becomes a simple form that calls the edge function

Recommendation: **Option A** - Enhance the existing flow with an RPC

```text
File: supabase/migrations/[timestamp]_create_accept_invitation_rpc.sql
```

```sql
-- RPC to atomically accept an invitation and create all required records
CREATE OR REPLACE FUNCTION public.accept_invitation_v2(
  p_token_hash text,
  p_user_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_invitation record;
  v_tenant_role text;
BEGIN
  -- Find invitation by token hash
  SELECT * INTO v_invitation
  FROM public.user_invitations
  WHERE token_hash = p_token_hash
    AND status = 'pending'
    AND expires_at > now();

  IF v_invitation IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'code', 'INVALID_TOKEN');
  END IF;

  -- Map invitation unicorn_role to tenant_members role
  v_tenant_role := CASE v_invitation.unicorn_role
    WHEN 'Admin' THEN 'Admin'
    WHEN 'General User' THEN 'General User'
    WHEN 'User' THEN 'General User'
    ELSE 'General User'
  END;

  -- Create or update tenant membership
  INSERT INTO public.tenant_members (
    user_id, tenant_id, role, status, joined_at, created_at, updated_at
  ) VALUES (
    p_user_id, v_invitation.tenant_id, v_tenant_role, 'active', now(), now(), now()
  )
  ON CONFLICT (tenant_id, user_id) DO UPDATE SET
    role = EXCLUDED.role,
    status = 'active',
    joined_at = COALESCE(tenant_members.joined_at, now()),
    updated_at = now();

  -- Update users table with tenant_id if not set
  UPDATE public.users
  SET tenant_id = v_invitation.tenant_id,
      updated_at = now()
  WHERE user_uuid = p_user_id
    AND tenant_id IS NULL;

  -- Mark invitation as accepted
  UPDATE public.user_invitations
  SET status = 'accepted',
      accepted_at = now(),
      updated_at = now()
  WHERE id = v_invitation.id;

  -- Audit log
  INSERT INTO public.audit_eos_events (
    tenant_id, user_id, entity, entity_id, action, reason, details
  ) VALUES (
    v_invitation.tenant_id,
    p_user_id,
    'user_invitations',
    v_invitation.id::text::uuid,
    'invitation_accepted',
    'User accepted invitation via self-service',
    jsonb_build_object(
      'email', v_invitation.email,
      'role', v_tenant_role,
      'tenant_id', v_invitation.tenant_id
    )
  );

  RETURN jsonb_build_object(
    'ok', true,
    'tenant_id', v_invitation.tenant_id,
    'role', v_tenant_role
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.accept_invitation_v2(text, uuid) TO authenticated;
```

### 2. Update AcceptInvitation.tsx

After `signUp` succeeds, call the RPC to finalize membership:

```typescript
// After successful signup/signin
const { data: acceptResult } = await supabase.rpc('accept_invitation_v2', {
  p_token_hash: tokenHash,
  p_user_id: authData.user.id
});

if (!acceptResult?.ok) {
  console.error('Failed to finalize membership:', acceptResult);
}
```

### 3. Add user_invitations.accepted_at Column (if missing)

```sql
ALTER TABLE public.user_invitations
ADD COLUMN IF NOT EXISTS accepted_at timestamptz;
```

## Files to Create/Modify

| File | Action | Purpose |
|------|--------|---------|
| `supabase/migrations/[timestamp]_accept_invitation_rpc.sql` | Create | Add RPC for atomic invitation acceptance |
| `src/pages/AcceptInvitation.tsx` | Modify | Call RPC after signup to create membership |
| `src/pages/AdminUserAudit.tsx` | Enhance | Add UI for running repair functions |

## Parent/Child Tenant Clarification

Based on your response, "Parent" and "Child" are labels within a single tenant record (via `user_type`), not separate tenant records. This simplifies the architecture:

- `user_type = 'Client Parent'` indicates an org's primary contact
- `user_type = 'Client Child'` indicates additional staff
- Both belong to the same `tenant_id`
- The `tenant_members` table tracks user-to-tenant relationships

No changes needed for parent/child tenant handling.

## Who Can Invite Users

Based on your response (all three options selected), the current implementation is correct:

| Who | Can Invite To | Via |
|-----|---------------|-----|
| SuperAdmin | Any tenant | Team Users page or Tenant Detail page |
| Tenant Admin | Their own tenant | Tenant Detail > Users tab |
| Vivacity Only | Any tenant (if clients request) | Team Users page |

The `invite-user` edge function already enforces these permissions.

## Expected Outcomes

After implementation:

1. New users accepting invitations will automatically have `tenant_members` entries created
2. SuperAdmins can diagnose and repair user issues from within Unicorn 2.0
3. No more need to manually fix records in Supabase dashboard
4. Password resets and magic links will work reliably for all users
5. Audit trail captures all user lifecycle events

## Testing Checklist

After implementation:

- [ ] Invite a new user to a tenant, accept invitation, verify `tenant_members` entry exists
- [ ] Request password reset for existing user, verify login works after reset
- [ ] Use magic link login for existing user, verify no errors
- [ ] Run audit functions from Admin UI, verify counts match expectations
- [ ] Run repair functions in dry-run mode, verify preview is accurate
- [ ] Apply repairs, verify issues are resolved

