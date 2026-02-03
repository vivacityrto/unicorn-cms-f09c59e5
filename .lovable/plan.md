
# Fix CSC Assignment Error and Audit Process

## Problem Identified

The error **"column 'entity_id' is of type uuid but expression is of type text"** occurs because:

| Component | Type | Issue |
|-----------|------|-------|
| `audit_events.entity_id` | `uuid` | Requires valid UUID format |
| `p_tenant_id` | `BIGINT` | Integer value (e.g., `6372`) |
| Cast attempt | `p_tenant_id::text` | Results in text like `'6372'`, not a valid UUID |

Both `admin_set_tenant_csc_assignment` and `admin_remove_tenant_csc_assignment` functions have this bug in their audit logging.

## Solution

Use the `client_audit_log` table instead of `audit_events` for CSC assignment auditing. This table is designed for tenant-related operations with:
- `entity_id` as `text` type (accepts any format)
- `tenant_id` column for proper tenant isolation
- `entity_type` column (vs `entity`)
- `actor_user_id` column (vs `user_id`)

## Database Changes

### Update `admin_set_tenant_csc_assignment` Function

Replace the audit insert to use `client_audit_log`:

```sql
-- Current (broken):
INSERT INTO public.audit_events (action, entity, entity_id, user_id, details)
VALUES ('set_assignment', 'tenant_csc_assignment', p_tenant_id::text, ...)

-- Fixed:
INSERT INTO public.client_audit_log (
  tenant_id, actor_user_id, action, entity_type, entity_id, details
)
VALUES (
  p_tenant_id, 
  v_actor_id, 
  'csc_assignment_set', 
  'tenant_csc_assignments', 
  p_csc_user_id::text,
  jsonb_build_object(
    'csc_user_id', p_csc_user_id,
    'is_primary', p_is_primary,
    'role_label', p_role_label
  )
);
```

### Update `admin_remove_tenant_csc_assignment` Function

Apply the same pattern:

```sql
INSERT INTO public.client_audit_log (
  tenant_id, actor_user_id, action, entity_type, entity_id, details
)
VALUES (
  p_tenant_id,
  v_actor_id,
  'csc_assignment_removed',
  'tenant_csc_assignments',
  p_csc_user_id::text,
  jsonb_build_object('csc_user_id', p_csc_user_id)
);
```

## Implementation

### Migration File

Create a single migration that updates both functions:

```sql
-- Fix CSC assignment audit logging
-- The audit_events table requires UUID for entity_id, but tenant_id is BIGINT
-- Use client_audit_log which is designed for tenant-related operations

CREATE OR REPLACE FUNCTION public.admin_set_tenant_csc_assignment(
  p_tenant_id BIGINT,
  p_csc_user_id UUID,
  p_is_primary BOOLEAN DEFAULT TRUE,
  p_role_label TEXT DEFAULT 'CSC'
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor_id UUID := auth.uid();
  v_is_admin BOOLEAN;
  v_is_csc BOOLEAN;
  v_staff_teams TEXT[];
  v_staff_team TEXT;
BEGIN
  -- Check if actor is SuperAdmin
  SELECT public.is_super_admin() INTO v_is_admin;
  
  IF NOT v_is_admin THEN
    RETURN jsonb_build_object('success', false, 'error', 'Only SuperAdmin can manage CSC assignments');
  END IF;
  
  -- Check if user is a CSC using staff_teams array, legacy staff_team, or is_csc flag
  SELECT is_csc, staff_teams, staff_team 
  INTO v_is_csc, v_staff_teams, v_staff_team 
  FROM public.users 
  WHERE user_uuid = p_csc_user_id;
  
  IF NOT (
    COALESCE(v_is_csc, FALSE) OR 
    v_staff_team = 'client_success' OR 
    'client_success' = ANY(COALESCE(v_staff_teams, ARRAY[]::TEXT[]))
  ) THEN
    RETURN jsonb_build_object('success', false, 'error', 'User is not marked as Client Success team member');
  END IF;
  
  -- If setting as primary, unset other primaries first
  IF p_is_primary THEN
    UPDATE public.tenant_csc_assignments
    SET is_primary = FALSE, updated_at = NOW()
    WHERE tenant_id = p_tenant_id AND is_primary = TRUE;
  END IF;
  
  -- Upsert assignment
  INSERT INTO public.tenant_csc_assignments (tenant_id, csc_user_id, is_primary, role_label, updated_at)
  VALUES (p_tenant_id, p_csc_user_id, p_is_primary, p_role_label, NOW())
  ON CONFLICT (tenant_id, csc_user_id) DO UPDATE SET
    is_primary = EXCLUDED.is_primary,
    role_label = EXCLUDED.role_label,
    updated_at = NOW();
  
  -- Audit log using client_audit_log (proper table for tenant operations)
  INSERT INTO public.client_audit_log (tenant_id, actor_user_id, action, entity_type, entity_id, details)
  VALUES (
    p_tenant_id, 
    v_actor_id, 
    'csc_assignment_set', 
    'tenant_csc_assignments', 
    p_csc_user_id::text,
    jsonb_build_object(
      'csc_user_id', p_csc_user_id,
      'is_primary', p_is_primary,
      'role_label', p_role_label
    )
  );
  
  RETURN jsonb_build_object('success', true);
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_remove_tenant_csc_assignment(
  p_tenant_id BIGINT,
  p_csc_user_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor_id UUID := auth.uid();
  v_is_admin BOOLEAN;
BEGIN
  SELECT public.is_super_admin() INTO v_is_admin;
  
  IF NOT v_is_admin THEN
    RETURN jsonb_build_object('success', false, 'error', 'Only SuperAdmin can manage CSC assignments');
  END IF;
  
  DELETE FROM public.tenant_csc_assignments
  WHERE tenant_id = p_tenant_id AND csc_user_id = p_csc_user_id;
  
  -- Audit log using client_audit_log (proper table for tenant operations)
  INSERT INTO public.client_audit_log (tenant_id, actor_user_id, action, entity_type, entity_id, details)
  VALUES (
    p_tenant_id,
    v_actor_id,
    'csc_assignment_removed',
    'tenant_csc_assignments',
    p_csc_user_id::text,
    jsonb_build_object('csc_user_id', p_csc_user_id)
  );
  
  RETURN jsonb_build_object('success', true);
END;
$$;
```

## CSC Assignment Flow Summary

| Step | Component | Action |
|------|-----------|--------|
| 1 | `ManageTenants.tsx` | User clicks "Assign" in CSC column |
| 2 | `CSCQuickAssignDialog.tsx` | Dialog opens with tenant ID/name |
| 3 | `useTenantCSCAssignment.tsx` | Fetches available CSC users (staff with `client_success` in `staff_teams`) |
| 4 | User selects CSC | Calls `assignCSC(user_uuid)` |
| 5 | Hook | Calls RPC `admin_set_tenant_csc_assignment` |
| 6 | Database Function | Validates SuperAdmin, validates CSC eligibility |
| 7 | Database Function | Upserts to `tenant_csc_assignments` |
| 8 | Database Function | Logs to `client_audit_log` (after fix) |
| 9 | Hook | Invalidates queries, shows toast |
| 10 | UI | Dialog closes, table refreshes |

## Files Modified

| File | Change |
|------|--------|
| New migration SQL | Fix both CSC assignment functions to use `client_audit_log` |

## Testing Steps

After migration:
1. Navigate to Manage Clients page
2. Click "Assign" on any client's CSC column
3. Select a user with Client Success team assignment
4. Verify assignment saves without error
5. Verify CSC name appears in the table column
6. Check `client_audit_log` table for new audit entry
