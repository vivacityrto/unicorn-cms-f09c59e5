-- 1) Secondary Contact column + unique-per-tenant index
ALTER TABLE public.tenant_users
  ADD COLUMN IF NOT EXISTS secondary_contact boolean NOT NULL DEFAULT false;

CREATE UNIQUE INDEX IF NOT EXISTS tenant_users_one_secondary
  ON public.tenant_users(tenant_id) WHERE secondary_contact = true;

ALTER TABLE public.tenant_profile
  ADD COLUMN IF NOT EXISTS secondary_contact_name text,
  ADD COLUMN IF NOT EXISTS secondary_contact_email text,
  ADD COLUMN IF NOT EXISTS secondary_contact_phone text;

CREATE OR REPLACE FUNCTION public.sync_primary_contact_on_role()
RETURNS trigger LANGUAGE plpgsql AS $function$
BEGIN
  IF NEW.role = 'parent' AND (NEW.primary_contact IS NULL OR NEW.primary_contact = false) THEN
    NEW.primary_contact := true;
  END IF;
  IF NEW.primary_contact = true AND NEW.secondary_contact = true THEN
    NEW.secondary_contact := false;
  END IF;
  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.sync_tenant_secondary_contact_profile()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $function$
DECLARE
  v_tenant_id bigint;
  v_name text; v_email text; v_phone text;
BEGIN
  v_tenant_id := COALESCE(NEW.tenant_id, OLD.tenant_id);

  SELECT NULLIF(TRIM(COALESCE(u.first_name,'') || ' ' || COALESCE(u.last_name,'')), ''),
         u.email,
         COALESCE(u.phone, u.mobile_phone)
  INTO v_name, v_email, v_phone
  FROM public.tenant_users tu
  JOIN public.users u ON u.user_uuid = tu.user_id
  WHERE tu.tenant_id = v_tenant_id AND tu.secondary_contact = true
  LIMIT 1;

  INSERT INTO public.tenant_profile (tenant_id, secondary_contact_name, secondary_contact_email, secondary_contact_phone, updated_at)
  VALUES (v_tenant_id, v_name, v_email, v_phone, now())
  ON CONFLICT (tenant_id) DO UPDATE
    SET secondary_contact_name = EXCLUDED.secondary_contact_name,
        secondary_contact_email = EXCLUDED.secondary_contact_email,
        secondary_contact_phone = EXCLUDED.secondary_contact_phone,
        updated_at = now();

  RETURN COALESCE(NEW, OLD);
END;
$function$;

DROP TRIGGER IF EXISTS trg_sync_secondary_contact ON public.tenant_users;
CREATE TRIGGER trg_sync_secondary_contact
AFTER INSERT OR UPDATE OF secondary_contact, user_id OR DELETE
ON public.tenant_users
FOR EACH ROW EXECUTE FUNCTION public.sync_tenant_secondary_contact_profile();

-- Register Secondary Contact merge fields (manual id assignment)
DO $$
DECLARE
  next_id integer;
  v RECORD;
BEGIN
  FOR v IN
    SELECT * FROM (VALUES
      ('SecondaryContactName',  'Secondary Contact Name',  'tenant_profile', 'secondary_contact_name',  'text', 'Secondary contact full name'),
      ('SecondaryContactEmail', 'Secondary Contact Email', 'tenant_profile', 'secondary_contact_email', 'text', 'Secondary contact email'),
      ('SecondaryContactPhone', 'Secondary Contact Phone', 'tenant_profile', 'secondary_contact_phone', 'text', 'Secondary contact phone')
    ) AS t(tag, name, source_table, source_column, field_type, description)
  LOOP
    IF NOT EXISTS (SELECT 1 FROM public.dd_fields WHERE tag = v.tag) THEN
      SELECT COALESCE(MAX(id),0)+1 INTO next_id FROM public.dd_fields;
      INSERT INTO public.dd_fields (id, tag, name, source_table, source_column, field_type, is_active, description)
      VALUES (next_id, v.tag, v.name, v.source_table, v.source_column, v.field_type, true, v.description);
    END IF;
  END LOOP;
END $$;

-- 2) Replace rpc_import_meeting_time_to_client (takes p_package_instance_id)
DROP FUNCTION IF EXISTS public.rpc_import_meeting_time_to_client(bigint, uuid, integer, date, text, bigint, boolean);

CREATE OR REPLACE FUNCTION public.rpc_import_meeting_time_to_client(
  p_client_id bigint,
  p_calendar_event_id uuid,
  p_minutes integer,
  p_work_date date,
  p_notes text DEFAULT NULL,
  p_package_instance_id bigint DEFAULT NULL,
  p_save_as_draft boolean DEFAULT false
)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO '' AS $function$
DECLARE
  v_user_id uuid;
  v_tenant_id bigint;
  v_time_entry_id uuid;
  v_draft_id uuid;
  v_client_name text;
  v_package_instance_id bigint;
  v_base_package_id bigint;
  v_has_access boolean;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'not_authenticated');
  END IF;

  SELECT id, name INTO v_tenant_id, v_client_name FROM public.tenants WHERE id = p_client_id;
  IF v_tenant_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'client_not_found');
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM public.users
    WHERE user_uuid = v_user_id
      AND (global_role IN ('superadmin','SuperAdmin')
           OR unicorn_role IN ('Super Admin','Team Leader','Team Member'))
  ) OR EXISTS (
    SELECT 1 FROM public.connected_tenants
    WHERE user_uuid = v_user_id AND tenant_id = v_tenant_id
  ) INTO v_has_access;

  IF NOT v_has_access THEN
    RETURN jsonb_build_object('success', false, 'error', 'access_denied');
  END IF;

  IF p_minutes <= 0 THEN
    RETURN jsonb_build_object('success', false, 'error', 'invalid_minutes');
  END IF;

  IF p_package_instance_id IS NOT NULL THEN
    SELECT pi.id, pi.package_id INTO v_package_instance_id, v_base_package_id
    FROM public.package_instances pi
    WHERE pi.id = p_package_instance_id AND pi.tenant_id = v_tenant_id;

    IF v_package_instance_id IS NULL THEN
      RETURN jsonb_build_object('success', false,
        'error', format('package_instance_id %s does not belong to tenant %s', p_package_instance_id, v_tenant_id));
    END IF;
  ELSE
    SELECT pi.id, pi.package_id INTO v_package_instance_id, v_base_package_id
    FROM public.package_instances pi
    WHERE pi.tenant_id = v_tenant_id AND pi.is_complete = false
    ORDER BY pi.start_date DESC LIMIT 1;
  END IF;

  IF p_save_as_draft THEN
    INSERT INTO public.calendar_time_drafts (
      tenant_id, created_by, calendar_event_id, client_id, package_id,
      minutes, work_date, notes, status, work_type, is_billable
    ) VALUES (
      v_tenant_id, v_user_id, p_calendar_event_id, p_client_id, v_base_package_id,
      p_minutes, p_work_date, p_notes, 'draft', 'meeting', true
    ) RETURNING id INTO v_draft_id;

    RETURN jsonb_build_object('success', true, 'draft_id', v_draft_id,
      'minutes_total', p_minutes, 'status', 'draft',
      'client_name', v_client_name, 'package_allocated', v_package_instance_id IS NOT NULL);
  ELSE
    INSERT INTO public.time_entries (
      tenant_id, client_id, package_id, package_instance_id, user_id, work_type, is_billable,
      start_at, duration_minutes, notes, source, calendar_event_id
    ) VALUES (
      v_tenant_id, p_client_id, v_base_package_id, v_package_instance_id, v_user_id, 'meeting', true,
      (p_work_date::timestamp AT TIME ZONE 'UTC'), p_minutes, p_notes, 'calendar', p_calendar_event_id
    ) RETURNING id INTO v_time_entry_id;

    INSERT INTO public.client_audit_log (
      tenant_id, actor_user_id, action, entity_type, entity_id,
      before_data, after_data, details
    ) VALUES (
      v_tenant_id, v_user_id, 'meeting_time_import', 'time_entries', v_time_entry_id::text,
      '{}'::jsonb,
      jsonb_build_object('minutes', p_minutes, 'package_id', v_base_package_id, 'package_instance_id', v_package_instance_id),
      jsonb_build_object('calendar_event_id', p_calendar_event_id, 'reason', 'Imported from meeting')
    );

    RETURN jsonb_build_object('success', true, 'time_entry_id', v_time_entry_id,
      'minutes_total', p_minutes, 'status', 'posted',
      'client_name', v_client_name, 'package_allocated', v_package_instance_id IS NOT NULL);
  END IF;
END;
$function$;