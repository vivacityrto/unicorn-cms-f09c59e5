-- Fix the overly permissive RLS policy on audit_ask_viv_access_denied
DROP POLICY IF EXISTS "ask_viv_denied_logs_insert" ON public.audit_ask_viv_access_denied;

-- Only allow inserts from authenticated users (service role will bypass anyway)
CREATE POLICY "ask_viv_denied_logs_insert_auth"
ON public.audit_ask_viv_access_denied
FOR INSERT
TO authenticated
WITH CHECK (user_id IS NOT NULL);

-- Fix sync_is_vivacity_internal function to set search_path
CREATE OR REPLACE FUNCTION public.sync_is_vivacity_internal()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
BEGIN
  NEW.is_vivacity_internal := NEW.unicorn_role IN ('Super Admin', 'Team Leader', 'Team Member');
  RETURN NEW;
END;
$$;