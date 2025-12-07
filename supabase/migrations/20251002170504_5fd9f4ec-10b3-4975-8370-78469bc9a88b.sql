-- Drop the dependent policies on audit_log
DROP POLICY IF EXISTS "Users can insert audit logs" ON public.audit_log;
DROP POLICY IF EXISTS "Users can view audit logs for users they can manage" ON public.audit_log;

-- Drop the sync_user_type trigger
DROP TRIGGER IF EXISTS sync_user_type_trigger ON public.users;

-- Drop the sync_user_type function
DROP FUNCTION IF EXISTS public.sync_user_type();

-- Drop the user_type column from users table
ALTER TABLE public.users DROP COLUMN IF EXISTS user_type CASCADE;

-- Recreate audit_log policies using unicorn_role instead of user_type
CREATE POLICY "Users can insert audit logs" 
ON public.audit_log 
FOR INSERT 
WITH CHECK (true);

CREATE POLICY "Users can view audit logs for users they can manage" 
ON public.audit_log 
FOR SELECT 
USING (
  EXISTS (
    SELECT 1 FROM public.users 
    WHERE users.user_uuid = auth.uid() 
    AND users.unicorn_role IN ('Super Admin', 'Admin')
  )
);