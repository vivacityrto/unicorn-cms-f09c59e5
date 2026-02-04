
-- Add scope column and make tenant_id nullable for internal EOS support
ALTER TABLE public.eos_qc 
ADD COLUMN IF NOT EXISTS scope text NOT NULL DEFAULT 'vivacity';

-- Make tenant_id nullable for internal Vivacity EOS
ALTER TABLE public.eos_qc 
ALTER COLUMN tenant_id DROP NOT NULL;

-- Add constraint to enforce scope/tenant_id relationship
ALTER TABLE public.eos_qc
ADD CONSTRAINT eos_qc_scope_tenant_check 
CHECK (
  (scope = 'vivacity') OR 
  (scope = 'tenant' AND tenant_id IS NOT NULL)
);

-- Create helper function to check if user is Vivacity Team member
CREATE OR REPLACE FUNCTION public.is_vivacity_team_user(p_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.users
    WHERE user_uuid = p_user_id
    AND unicorn_role IN ('Super Admin', 'Team Leader', 'Team Member')
    AND (archived = false OR archived IS NULL)
  );
$$;

-- Drop existing qc_schedule function and recreate with Vivacity support
DROP FUNCTION IF EXISTS public.qc_schedule(uuid, uuid[], uuid, date, date, timestamptz);

CREATE OR REPLACE FUNCTION public.qc_schedule(
  p_reviewee_id uuid,
  p_manager_ids uuid[],
  p_template_id uuid,
  p_quarter_start date,
  p_quarter_end date,
  p_scheduled_at timestamptz DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_qc_id UUID;
  v_tenant_id BIGINT;
  v_is_vivacity_user BOOLEAN;
  v_system_tenant_id BIGINT;
BEGIN
  -- Check if current user is a Vivacity Team user
  v_is_vivacity_user := is_vivacity_team_user(auth.uid());
  
  -- Get system tenant ID for Vivacity
  SELECT id INTO v_system_tenant_id FROM public.tenants WHERE is_system_tenant = true LIMIT 1;
  
  IF v_is_vivacity_user THEN
    -- For Vivacity Team users, use system tenant ID
    v_tenant_id := v_system_tenant_id;
    
    -- Verify reviewee is also a Vivacity Team user
    IF NOT is_vivacity_team_user(p_reviewee_id) THEN
      RAISE EXCEPTION 'Reviewee must be a Vivacity Team member';
    END IF;
    
    -- Verify all managers are Vivacity Team users
    IF EXISTS (
      SELECT 1 FROM unnest(p_manager_ids) AS manager_id
      WHERE NOT is_vivacity_team_user(manager_id)
    ) THEN
      RAISE EXCEPTION 'All managers must be Vivacity Team members';
    END IF;
    
    -- Create QC with vivacity scope
    INSERT INTO public.eos_qc (
      tenant_id,
      scope,
      reviewee_id,
      manager_ids,
      template_id,
      quarter_start,
      quarter_end,
      scheduled_at,
      status,
      created_by
    ) VALUES (
      v_system_tenant_id,
      'vivacity',
      p_reviewee_id,
      p_manager_ids,
      p_template_id,
      p_quarter_start,
      p_quarter_end,
      COALESCE(p_scheduled_at, now()),
      'scheduled',
      auth.uid()
    ) RETURNING id INTO v_qc_id;
  ELSE
    -- For non-Vivacity users, get tenant from user
    SELECT tenant_id INTO v_tenant_id
    FROM public.users
    WHERE user_uuid = auth.uid();
    
    IF v_tenant_id IS NULL THEN
      RAISE EXCEPTION 'User must belong to a tenant';
    END IF;
    
    -- Verify user is manager or admin for tenant scope
    IF NOT (
      auth.uid() = ANY(p_manager_ids)
      OR is_eos_admin(auth.uid(), v_tenant_id)
      OR is_super_admin()
    ) THEN
      RAISE EXCEPTION 'Only managers or admins can schedule QCs';
    END IF;
    
    -- Create QC with tenant scope
    INSERT INTO public.eos_qc (
      tenant_id,
      scope,
      reviewee_id,
      manager_ids,
      template_id,
      quarter_start,
      quarter_end,
      scheduled_at,
      status,
      created_by
    ) VALUES (
      v_tenant_id,
      'tenant',
      p_reviewee_id,
      p_manager_ids,
      p_template_id,
      p_quarter_start,
      p_quarter_end,
      COALESCE(p_scheduled_at, now()),
      'scheduled',
      auth.uid()
    ) RETURNING id INTO v_qc_id;
  END IF;
  
  -- Audit log
  INSERT INTO public.audit_eos_events (
    tenant_id,
    user_id,
    entity,
    entity_id,
    action,
    reason,
    details
  ) VALUES (
    v_tenant_id,
    auth.uid(),
    'qc',
    v_qc_id,
    'scheduled',
    'Quarterly Conversation scheduled',
    jsonb_build_object(
      'reviewee_id', p_reviewee_id,
      'manager_count', array_length(p_manager_ids, 1),
      'quarter_start', p_quarter_start,
      'quarter_end', p_quarter_end,
      'scope', CASE WHEN v_is_vivacity_user THEN 'vivacity' ELSE 'tenant' END
    )
  );
  
  RETURN v_qc_id;
END;
$$;

-- Drop existing RLS policies
DROP POLICY IF EXISTS "QC read access for SuperAdmin" ON public.eos_qc;
DROP POLICY IF EXISTS "QC read access for participants" ON public.eos_qc;
DROP POLICY IF EXISTS "QC write access for SuperAdmin only" ON public.eos_qc;
DROP POLICY IF EXISTS "qc_delete" ON public.eos_qc;
DROP POLICY IF EXISTS "qc_insert" ON public.eos_qc;
DROP POLICY IF EXISTS "qc_select" ON public.eos_qc;
DROP POLICY IF EXISTS "qc_update" ON public.eos_qc;

-- Create new RLS policies supporting both vivacity and tenant scopes

-- Select: Vivacity Team users can see all vivacity-scope QCs
CREATE POLICY "qc_select_vivacity"
ON public.eos_qc
FOR SELECT
TO authenticated
USING (
  scope = 'vivacity' 
  AND is_vivacity_team_user(auth.uid())
);

-- Select: Tenant users can see their tenant QCs if they are participants or admins
CREATE POLICY "qc_select_tenant"
ON public.eos_qc
FOR SELECT
TO authenticated
USING (
  scope = 'tenant'
  AND tenant_id IS NOT NULL
  AND (
    reviewee_id = auth.uid()
    OR auth.uid() = ANY(manager_ids)
    OR is_eos_admin(auth.uid(), tenant_id)
    OR is_super_admin()
  )
);

-- Insert: Vivacity Team users can create vivacity-scope QCs via RPC
-- (RPC handles the actual insert with SECURITY DEFINER)
CREATE POLICY "qc_insert_vivacity"
ON public.eos_qc
FOR INSERT
TO authenticated
WITH CHECK (
  scope = 'vivacity' 
  AND is_vivacity_team_user(auth.uid())
  AND created_by = auth.uid()
);

-- Insert: Tenant users can create tenant-scope QCs
CREATE POLICY "qc_insert_tenant"
ON public.eos_qc
FOR INSERT
TO authenticated
WITH CHECK (
  scope = 'tenant'
  AND tenant_id IS NOT NULL
  AND (
    auth.uid() = ANY(manager_ids)
    OR is_eos_admin(auth.uid(), tenant_id)
    OR is_super_admin()
  )
);

-- Update: Vivacity Team users can update vivacity-scope QCs they are part of
CREATE POLICY "qc_update_vivacity"
ON public.eos_qc
FOR UPDATE
TO authenticated
USING (
  scope = 'vivacity'
  AND is_vivacity_team_user(auth.uid())
  AND (
    reviewee_id = auth.uid()
    OR auth.uid() = ANY(manager_ids)
    OR is_super_admin()
  )
)
WITH CHECK (
  scope = 'vivacity'
  AND is_vivacity_team_user(auth.uid())
);

-- Update: Tenant users can update tenant-scope QCs
CREATE POLICY "qc_update_tenant"
ON public.eos_qc
FOR UPDATE
TO authenticated
USING (
  scope = 'tenant'
  AND tenant_id IS NOT NULL
  AND (
    reviewee_id = auth.uid()
    OR auth.uid() = ANY(manager_ids)
    OR is_eos_admin(auth.uid(), tenant_id)
    OR is_super_admin()
  )
)
WITH CHECK (
  scope = 'tenant'
  AND tenant_id IS NOT NULL
);

-- Delete: Vivacity Team Super Admins can delete vivacity-scope QCs
CREATE POLICY "qc_delete_vivacity"
ON public.eos_qc
FOR DELETE
TO authenticated
USING (
  scope = 'vivacity'
  AND is_super_admin()
);

-- Delete: Tenant admins can delete tenant-scope QCs
CREATE POLICY "qc_delete_tenant"
ON public.eos_qc
FOR DELETE
TO authenticated
USING (
  scope = 'tenant'
  AND tenant_id IS NOT NULL
  AND (
    is_eos_admin(auth.uid(), tenant_id)
    OR is_super_admin()
  )
);

-- Update existing QCs to have scope 'vivacity' since they were created by Vivacity Team
UPDATE public.eos_qc 
SET scope = 'vivacity'
WHERE scope IS NULL OR scope = 'vivacity';
