
-- Step 1: Create the missing is_vivacity_team_safe helper function
CREATE OR REPLACE FUNCTION public.is_vivacity_team_safe(p_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.users
    WHERE user_uuid = p_user_id
      AND unicorn_role IN ('Super Admin', 'Team Leader', 'Team Member')
  );
$$;

GRANT EXECUTE ON FUNCTION public.is_vivacity_team_safe(uuid) TO authenticated;

-- Step 2: Fix audit trigger - remove ::text casts so uuid passes directly to entity_id
CREATE OR REPLACE FUNCTION public.audit_tenant_sharepoint_settings()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    INSERT INTO public.audit_events (action, entity, entity_id, user_id, details)
    VALUES (
      'create',
      'tenant_sharepoint_settings',
      NEW.id,
      auth.uid(),
      jsonb_build_object(
        'tenant_id', NEW.tenant_id,
        'root_folder_url', NEW.root_folder_url,
        'reason', 'SharePoint root folder configured'
      )
    );
  ELSIF TG_OP = 'UPDATE' THEN
    INSERT INTO public.audit_events (action, entity, entity_id, user_id, details)
    VALUES (
      'update',
      'tenant_sharepoint_settings',
      NEW.id,
      auth.uid(),
      jsonb_build_object(
        'tenant_id', NEW.tenant_id,
        'before', jsonb_build_object(
          'root_folder_url', OLD.root_folder_url,
          'is_enabled', OLD.is_enabled,
          'validation_status', OLD.validation_status
        ),
        'after', jsonb_build_object(
          'root_folder_url', NEW.root_folder_url,
          'is_enabled', NEW.is_enabled,
          'validation_status', NEW.validation_status
        ),
        'reason', 'SharePoint root folder updated'
      )
    );
  ELSIF TG_OP = 'DELETE' THEN
    INSERT INTO public.audit_events (action, entity, entity_id, user_id, details)
    VALUES (
      'delete',
      'tenant_sharepoint_settings',
      OLD.id,
      auth.uid(),
      jsonb_build_object(
        'tenant_id', OLD.tenant_id,
        'root_folder_url', OLD.root_folder_url,
        'reason', 'SharePoint root folder removed'
      )
    );
  END IF;
  RETURN COALESCE(NEW, OLD);
END;
$$;
