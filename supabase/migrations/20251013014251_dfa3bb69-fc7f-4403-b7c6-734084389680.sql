-- Add invite_attempts column to audit_invites to track number of attempts per email/tenant
ALTER TABLE public.audit_invites 
ADD COLUMN IF NOT EXISTS invite_attempts INTEGER DEFAULT 1;

-- Create index for better query performance when counting attempts
CREATE INDEX IF NOT EXISTS idx_audit_invites_email_tenant 
ON public.audit_invites(email, tenant_id);

-- Update existing unicorn_role enum to include Team Leader and Team Member
DO $$ 
BEGIN
  -- Check if the enum values already exist before adding them
  IF NOT EXISTS (SELECT 1 FROM pg_enum WHERE enumlabel = 'Team Leader' AND enumtypid = 'public.unicorn_role'::regtype) THEN
    ALTER TYPE public.unicorn_role ADD VALUE 'Team Leader';
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM pg_enum WHERE enumlabel = 'Team Member' AND enumtypid = 'public.unicorn_role'::regtype) THEN
    ALTER TYPE public.unicorn_role ADD VALUE 'Team Member';
  END IF;
END $$;

-- Create or replace function to automatically set user_type based on unicorn_role
CREATE OR REPLACE FUNCTION public.set_user_type_from_role()
RETURNS TRIGGER AS $$
BEGIN
  -- Map unicorn_role to user_type
  CASE NEW.unicorn_role::text
    WHEN 'Super Admin' THEN
      NEW.user_type := 'Vivacity';
    WHEN 'Team Leader' THEN
      NEW.user_type := 'Vivacity';
    WHEN 'Team Member' THEN
      NEW.user_type := 'Vivacity';
    WHEN 'Admin' THEN
      NEW.user_type := 'Client Parent';
    WHEN 'General' THEN
      NEW.user_type := 'Client Child';
    ELSE
      -- Keep existing user_type if role doesn't match
      NULL;
  END CASE;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger to automatically update user_type when unicorn_role changes
DROP TRIGGER IF EXISTS trg_set_user_type_from_role ON public.users;
CREATE TRIGGER trg_set_user_type_from_role
  BEFORE INSERT OR UPDATE OF unicorn_role ON public.users
  FOR EACH ROW
  EXECUTE FUNCTION public.set_user_type_from_role();