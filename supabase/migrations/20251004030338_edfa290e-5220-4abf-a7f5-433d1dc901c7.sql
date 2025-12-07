-- Fix Issue 1: Update RLS policies for invitation_tokens to allow Super Admins to insert
-- The invited_by field should be automatically set
DROP POLICY IF EXISTS "Super Admins can insert invitation tokens" ON public.invitation_tokens;
CREATE POLICY "Super Admins can insert invitation tokens" 
ON public.invitation_tokens 
FOR INSERT 
TO authenticated 
WITH CHECK (
  is_super_admin()
);

-- Fix Issue 2: Update tenant status based on active users
-- First, let's update all tenant statuses based on whether they have active users
UPDATE public.tenants t
SET status = CASE
  WHEN EXISTS (
    SELECT 1 FROM public.users u 
    WHERE u.tenant_id = t.id 
    AND u.disabled = false 
    AND u.archived = false
  ) THEN 'active'
  ELSE 'inactive'
END;

-- Recreate the trigger to properly update tenant status when users change
DROP TRIGGER IF EXISTS update_tenant_status_trigger ON public.users;

CREATE OR REPLACE FUNCTION public.update_tenant_status()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  -- Update the tenant's status based on all its users
  UPDATE public.tenants t
  SET status = CASE
    WHEN EXISTS (
      SELECT 1 FROM public.users u 
      WHERE u.tenant_id = t.id 
      AND u.disabled = false 
      AND u.archived = false
    ) THEN 'active'
    ELSE 'inactive'
  END
  WHERE t.id = COALESCE(NEW.tenant_id, OLD.tenant_id);
  
  RETURN COALESCE(NEW, OLD);
END;
$$;

-- Create trigger for INSERT, UPDATE, and DELETE on users
CREATE TRIGGER update_tenant_status_trigger
AFTER INSERT OR UPDATE OF disabled, archived, tenant_id OR DELETE ON public.users
FOR EACH ROW
EXECUTE FUNCTION public.update_tenant_status();