-- Give the bulk-generation automation account the one admin permission its
-- downstream provisioning call currently requires, without broadening the
-- Team Member role or making the automation account Super Admin.

DO $$
DECLARE
  v_user_uuid uuid;
BEGIN
  SELECT u.user_uuid
    INTO v_user_uuid
  FROM public.users u
  WHERE lower(COALESCE(u.email, u.email_address)) = 'bulk-generate-automation@vivacity.com.au'
  LIMIT 1;

  IF v_user_uuid IS NULL THEN
    RAISE EXCEPTION 'bulk-generate automation user not found';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.permission_features
    WHERE feature_key = 'admin.documents.bulk_generate'
  ) THEN
    RAISE EXCEPTION 'permission feature admin.documents.bulk_generate not found';
  END IF;

  INSERT INTO public.dd_unicorn_roles (
    label,
    value,
    description,
    is_active,
    sort_order,
    is_internal
  )
  VALUES (
    'Bulk Generate Automation',
    'Bulk Generate Automation',
    'Dedicated supplemental role for the bulk document generation automation account.',
    false,
    99,
    true
  )
  ON CONFLICT (value)
  DO UPDATE
    SET label = EXCLUDED.label,
        description = EXCLUDED.description,
        is_internal = EXCLUDED.is_internal,
        updated_at = now();

  INSERT INTO public.role_permissions (role, feature_key, level)
  VALUES ('Bulk Generate Automation', 'admin.documents.bulk_generate', 'full'::public.permission_level)
  ON CONFLICT (role, feature_key)
  DO UPDATE
    SET level = EXCLUDED.level,
        updated_at = now();

  INSERT INTO public.user_roles (user_uuid, role)
  VALUES (v_user_uuid, 'Bulk Generate Automation')
  ON CONFLICT (user_uuid, role)
  DO UPDATE
    SET expires_at = NULL,
        updated_at = now();
END;
$$;
