
-- ============================================================
-- FIX 1: package-documents storage - add tenant isolation
-- ============================================================

-- Helper function to check if user has access to a package's tenant
CREATE OR REPLACE FUNCTION public.storage_package_tenant_check(file_path text)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = 'public'
SET row_security = off
AS $$
DECLARE
  v_pkg_id bigint;
  v_tenant_id bigint;
  v_folder text;
BEGIN
  -- Extract first folder segment (e.g., 'package_40' or 'package-40')
  v_folder := split_part(file_path, '/', 1);
  
  -- Try to extract numeric ID from 'package_N' or 'package-N' format
  IF v_folder ~ '^package[_-]\d+$' THEN
    v_pkg_id := regexp_replace(v_folder, '^package[_-]', '')::bigint;
  ELSE
    RETURN false;
  END IF;

  -- Look up tenant_id from client_packages
  SELECT cp.tenant_id INTO v_tenant_id
  FROM client_packages cp
  WHERE cp.id = v_pkg_id;

  IF v_tenant_id IS NULL THEN
    RETURN false;
  END IF;

  -- Check if user is vivacity staff or has tenant access
  RETURN is_vivacity_team_safe(auth.uid()) 
      OR has_tenant_access_safe(v_tenant_id, auth.uid());
END;
$$;

-- Drop all existing package-documents policies
DROP POLICY IF EXISTS "Allow authenticated users to delete their package documents" ON storage.objects;
DROP POLICY IF EXISTS "Allow authenticated users to update their package documents" ON storage.objects;
DROP POLICY IF EXISTS "Allow authenticated users to upload package documents" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can delete package documents" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can read package documents" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can update package documents" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can upload package documents" ON storage.objects;

-- Create tenant-scoped policies
CREATE POLICY "package_docs_select" ON storage.objects
FOR SELECT TO authenticated
USING (
  bucket_id = 'package-documents'
  AND public.storage_package_tenant_check(name)
);

CREATE POLICY "package_docs_insert" ON storage.objects
FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'package-documents'
  AND public.storage_package_tenant_check(name)
);

CREATE POLICY "package_docs_update" ON storage.objects
FOR UPDATE TO authenticated
USING (
  bucket_id = 'package-documents'
  AND public.storage_package_tenant_check(name)
);

CREATE POLICY "package_docs_delete" ON storage.objects
FOR DELETE TO authenticated
USING (
  bucket_id = 'package-documents'
  AND public.storage_package_tenant_check(name)
);

-- ============================================================
-- FIX 2: user_invitations - replace public SELECT with RPC
-- ============================================================

-- Create a server-side RPC that validates a specific token
CREATE OR REPLACE FUNCTION public.validate_invitation_token(p_token_hash text)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = 'public'
SET row_security = off
AS $$
DECLARE
  v_result jsonb;
BEGIN
  SELECT jsonb_build_object(
    'id', ui.id,
    'email', ui.email,
    'first_name', ui.first_name,
    'last_name', ui.last_name,
    'tenant_id', ui.tenant_id,
    'unicorn_role', ui.unicorn_role,
    'status', ui.status,
    'expires_at', ui.expires_at
  ) INTO v_result
  FROM user_invitations ui
  WHERE ui.token_hash = p_token_hash
    AND ui.status = 'pending'
    AND ui.expires_at > now()
  LIMIT 1;

  IF v_result IS NULL THEN
    RETURN jsonb_build_object('error', 'Invalid or expired invitation token');
  END IF;

  RETURN v_result;
END;
$$;

-- Drop the overly permissive public SELECT policy
DROP POLICY IF EXISTS "user_invitations_validate_public" ON public.user_invitations;
