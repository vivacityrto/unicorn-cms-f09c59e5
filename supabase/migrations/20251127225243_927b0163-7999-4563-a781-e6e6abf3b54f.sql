-- Restore original tenant helper functions from sql-setup/02-tenant-functions.sql

-- Check if current user is a Vivacity staff member (SuperAdmin or VivacityTeam)
CREATE OR REPLACE FUNCTION public.is_vivacity()
RETURNS boolean AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM public.users 
    WHERE id = auth.uid() 
    AND role IN ('SuperAdmin', 'VivacityTeam')
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Check if current user is a SuperAdmin specifically
CREATE OR REPLACE FUNCTION public.is_superadmin()
RETURNS boolean AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM public.users 
    WHERE id = auth.uid() 
    AND role = 'SuperAdmin'
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Get current user's active tenant context
CREATE OR REPLACE FUNCTION public.current_tenant()
RETURNS uuid AS $$
DECLARE
  tenant_id uuid;
BEGIN
  -- Check if user is Vivacity (can switch tenants)
  IF public.is_vivacity() THEN
    -- Try to get from session variable first (for tenant switching)
    SELECT nullif(current_setting('app.current_tenant_id', true), '')::uuid INTO tenant_id;
    
    -- If no session variable, return null (Vivacity can access all)
    RETURN tenant_id;
  ELSE
    -- For regular users, return their primary tenant
    SELECT tm.tenant_id INTO tenant_id
    FROM public.tenant_members tm
    WHERE tm.user_id = auth.uid()
    AND tm.status = 'active'
    LIMIT 1;
    
    RETURN tenant_id;
  END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create a new tenant with optional admin user
CREATE OR REPLACE FUNCTION public.create_tenant(
  p_name text,
  p_slug text,
  p_admin_email text DEFAULT NULL
)
RETURNS uuid AS $$
DECLARE
  new_tenant_id uuid;
  admin_user_id uuid;
BEGIN
  -- Only SuperAdmin can create tenants
  IF NOT public.is_superadmin() THEN
    RAISE EXCEPTION 'Insufficient permissions to create tenant';
  END IF;

  -- Validate slug format (lowercase, alphanumeric + hyphens)
  IF p_slug !~ '^[a-z0-9-]+$' THEN
    RAISE EXCEPTION 'Tenant slug must contain only lowercase letters, numbers, and hyphens';
  END IF;

  -- Create the tenant
  INSERT INTO public.tenants (name, slug)
  VALUES (p_name, p_slug)
  RETURNING id INTO new_tenant_id;

  -- If admin email provided, look up user and add as tenant admin
  IF p_admin_email IS NOT NULL THEN
    SELECT id INTO admin_user_id
    FROM public.users
    WHERE email = p_admin_email;

    IF admin_user_id IS NOT NULL THEN
      INSERT INTO public.tenant_members (tenant_id, user_id, role, status, joined_at)
      VALUES (new_tenant_id, admin_user_id, 'Admin', 'active', now());
    END IF;
  END IF;

  RETURN new_tenant_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Invite a user to a tenant
CREATE OR REPLACE FUNCTION public.invite_user(
  p_tenant_id uuid,
  p_email text,
  p_role text DEFAULT 'User'
)
RETURNS text AS $$
DECLARE
  invite_token text;
  existing_user_id uuid;
BEGIN
  -- Check if user has permission to invite (Admin of tenant or Vivacity)
  IF NOT (
    public.is_vivacity() OR
    EXISTS (
      SELECT 1 FROM public.tenant_members tm
      WHERE tm.tenant_id = p_tenant_id
      AND tm.user_id = auth.uid()
      AND tm.role = 'Admin'
      AND tm.status = 'active'
    )
  ) THEN
    RAISE EXCEPTION 'Insufficient permissions to invite users to this tenant';
  END IF;

  -- Validate role
  IF p_role NOT IN ('User', 'Admin') THEN
    RAISE EXCEPTION 'Invalid role. Must be User or Admin';
  END IF;

  -- Generate unique token
  invite_token := encode(gen_random_bytes(32), 'base64url');

  -- Check if user already exists
  SELECT id INTO existing_user_id
  FROM public.users
  WHERE email = p_email;

  -- If user exists and is already a member, update their role
  IF existing_user_id IS NOT NULL THEN
    INSERT INTO public.tenant_members (tenant_id, user_id, role, status)
    VALUES (p_tenant_id, existing_user_id, p_role, 'active')
    ON CONFLICT (tenant_id, user_id)
    DO UPDATE SET
      role = excluded.role,
      status = 'active',
      joined_at = now(),
      updated_at = now();
  END IF;

  -- Always create invitation record for tracking
  INSERT INTO public.user_invitations (
    email, tenant_id, role, token, invited_by
  ) VALUES (
    p_email, p_tenant_id, p_role, invite_token, auth.uid()
  );

  RETURN invite_token;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Accept a tenant invitation
CREATE OR REPLACE FUNCTION public.accept_invite(p_token text)
RETURNS jsonb AS $$
DECLARE
  invitation record;
  user_id uuid;
BEGIN
  -- Get current user
  user_id := auth.uid();
  IF user_id IS NULL THEN
    RAISE EXCEPTION 'User must be authenticated to accept invitation';
  END IF;

  -- Find and validate invitation
  SELECT * INTO invitation
  FROM public.user_invitations
  WHERE token = p_token
  AND status = 'pending'
  AND expires_at > now();

  IF invitation IS NULL THEN
    RAISE EXCEPTION 'Invalid or expired invitation token';
  END IF;

  -- Verify email matches (case insensitive)
  IF NOT EXISTS (
    SELECT 1 FROM public.users
    WHERE id = user_id
    AND lower(email) = lower(invitation.email)
  ) THEN
    RAISE EXCEPTION 'Invitation email does not match user account';
  END IF;

  -- Add user to tenant
  INSERT INTO public.tenant_members (tenant_id, user_id, role, status, joined_at)
  VALUES (invitation.tenant_id, user_id, invitation.role, 'active', now())
  ON CONFLICT (tenant_id, user_id)
  DO UPDATE SET
    role = excluded.role,
    status = 'active',
    joined_at = now(),
    updated_at = now();

  -- Mark invitation as accepted
  UPDATE public.user_invitations
  SET status = 'accepted', updated_at = now()
  WHERE id = invitation.id;

  -- Set as active tenant for the user
  PERFORM set_config('app.current_tenant_id', invitation.tenant_id::text, false);

  RETURN jsonb_build_object(
    'success', true,
    'tenant_id', invitation.tenant_id,
    'role', invitation.role
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Set active tenant (for Vivacity users who can switch contexts)
CREATE OR REPLACE FUNCTION public.set_active_tenant(p_tenant_id uuid)
RETURNS boolean AS $$
BEGIN
  -- Only Vivacity users can switch tenant contexts
  IF NOT public.is_vivacity() THEN
    RAISE EXCEPTION 'Only Vivacity staff can switch tenant contexts';
  END IF;

  -- Validate tenant exists
  IF NOT EXISTS (SELECT 1 FROM public.tenants WHERE id = p_tenant_id) THEN
    RAISE EXCEPTION 'Tenant does not exist';
  END IF;

  -- Set session variable
  PERFORM set_config('app.current_tenant_id', p_tenant_id::text, false);

  RETURN true;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;