-- SuperAdmin adjustment of a package instance's hours allowance, with a pinned
-- explanation on the package.
--
-- Why a function and not a client-side update: the allowance is read from
-- package_instances.included_minutes by the burndown view, the usage alerts and
-- the card total, and the open package_renewal_periods row carries its own copy
-- of it (rpc_get_package_usage reads the period's copy when asked for a specific
-- period). Changing one without the other, with no audit row and no visible
-- explanation, is how an allowance quietly stops matching what the client was
-- sold. This function changes all of it in one transaction.
--
-- The adjustment is a signed delta in hours, not an absolute value, so it reads
-- as "added 161 hours" and cannot silently overwrite a concurrent change.
--
-- The explanation is ONE pinned note per package instance (tag
-- 'allowance-adjustment'). A later adjustment appends a line to that note and
-- refreshes its title rather than stacking a second banner on the card.

CREATE OR REPLACE FUNCTION public.adjust_package_allowance(
  p_instance_id bigint,
  p_hours_delta numeric,
  p_reason      text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_actor       uuid := auth.uid();
  v_pi          public.package_instances%ROWTYPE;
  v_reason      text := btrim(coalesce(p_reason, ''));
  v_base_min    integer;
  v_delta_min   integer;
  v_new_min     integer;
  v_orig_min    integer;
  v_actor_name  text;
  v_note_id     uuid;
  v_note_html   text;
  v_title       text;
  v_entry       text;
  v_signed      text;
BEGIN
  IF v_actor IS NULL OR NOT public.is_super_admin() THEN
    RAISE EXCEPTION 'Only SuperAdmins can adjust a package allowance'
      USING ERRCODE = '42501';
  END IF;

  IF p_instance_id IS NULL OR p_hours_delta IS NULL THEN
    RAISE EXCEPTION 'Package instance and hours to add are required'
      USING ERRCODE = '22023';
  END IF;

  IF length(v_reason) < 5 THEN
    RAISE EXCEPTION 'A reason of at least 5 characters is required'
      USING ERRCODE = '22023';
  END IF;

  IF length(v_reason) > 500 THEN
    RAISE EXCEPTION 'The reason must be 500 characters or fewer'
      USING ERRCODE = '22023';
  END IF;

  IF abs(p_hours_delta) > 1000 THEN
    RAISE EXCEPTION 'A single adjustment can be at most 1000 hours'
      USING ERRCODE = '22023';
  END IF;

  v_delta_min := round(p_hours_delta * 60)::integer;
  IF v_delta_min = 0 THEN
    RAISE EXCEPTION 'The adjustment must change the allowance by at least one minute'
      USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_pi
  FROM public.package_instances
  WHERE id = p_instance_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Package instance % not found', p_instance_id
      USING ERRCODE = 'P0002';
  END IF;

  IF v_pi.is_complete THEN
    RAISE EXCEPTION 'The allowance of a completed package cannot be adjusted'
      USING ERRCODE = '22023';
  END IF;

  -- Same fallback chain rpc_get_package_usage uses for the base allowance.
  v_base_min := COALESCE(
    v_pi.included_minutes,
    COALESCE(
      v_pi.hours_included,
      (SELECT p.total_hours FROM public.packages p WHERE p.id = v_pi.package_id),
      0
    ) * 60
  );
  v_new_min := v_base_min + v_delta_min;

  IF v_new_min <= 0 THEN
    RAISE EXCEPTION 'The adjustment would leave the allowance at zero or below'
      USING ERRCODE = '22023';
  END IF;

  IF v_new_min > 120000 THEN
    RAISE EXCEPTION 'The allowance can be at most 2000 hours'
      USING ERRCODE = '22023';
  END IF;

  -- The allowance before the FIRST adjustment, so the pinned note can say
  -- "+161 h on the original 7 h" however many adjustments follow.
  SELECT (a.before_data ->> 'included_minutes')::integer
    INTO v_orig_min
  FROM public.client_audit_log a
  WHERE a.action = 'package_allowance_adjusted'
    AND a.entity_type = 'package_instances'
    AND a.entity_id = p_instance_id::text
  ORDER BY a.created_at ASC
  LIMIT 1;
  v_orig_min := COALESCE(v_orig_min, v_base_min);

  UPDATE public.package_instances
  SET included_minutes = v_new_min
  WHERE id = p_instance_id;

  -- Keep the open period's own copy in step (moved by the same delta so any
  -- pre-existing difference between the two is preserved, not hidden).
  UPDATE public.package_renewal_periods
  SET included_minutes = GREATEST(COALESCE(included_minutes, 0) + v_delta_min, 0)
  WHERE package_instance_id = p_instance_id
    AND closed_at IS NULL;

  -- Pinned explanation.
  SELECT NULLIF(btrim(coalesce(u.first_name, '') || ' ' || coalesce(u.last_name, '')), '')
    INTO v_actor_name
  FROM public.users u
  WHERE u.user_uuid = v_actor;
  v_actor_name := COALESCE(v_actor_name, 'a SuperAdmin');

  v_signed := CASE WHEN v_delta_min > 0 THEN '+' ELSE '' END
              || (round(v_delta_min / 60.0, 2))::float8::text;

  v_title := format(
    'Hours adjusted: %s h total (%s%s h on the original %s h)',
    (round(v_new_min / 60.0, 2))::float8::text,
    CASE WHEN v_new_min - v_orig_min > 0 THEN '+' ELSE '' END,
    (round((v_new_min - v_orig_min) / 60.0, 2))::float8::text,
    (round(v_orig_min / 60.0, 2))::float8::text
  );

  -- Text is HTML-escaped: the note body is rendered as HTML on the card.
  v_entry := format(
    '<li><strong>%s</strong> - %s h (%s h to %s h) by %s: %s</li>',
    to_char(now() AT TIME ZONE 'Australia/Sydney', 'DD Mon YYYY'),
    v_signed,
    (round(v_base_min / 60.0, 2))::float8::text,
    (round(v_new_min / 60.0, 2))::float8::text,
    replace(replace(replace(v_actor_name, '&', '&amp;'), '<', '&lt;'), '>', '&gt;'),
    replace(replace(replace(v_reason, '&', '&amp;'), '<', '&lt;'), '>', '&gt;')
  );

  SELECT n.id, n.note_details
    INTO v_note_id, v_note_html
  FROM public.notes n
  WHERE n.parent_type = 'package_instance'
    AND n.parent_id = p_instance_id
    AND 'allowance-adjustment' = ANY (n.tags)
  ORDER BY n.created_at ASC
  LIMIT 1;

  IF v_note_id IS NULL THEN
    INSERT INTO public.notes (
      tenant_id, parent_type, parent_id, package_id,
      title, note_details, note_type, tags, is_pinned, created_by
    ) VALUES (
      v_pi.tenant_id, 'package_instance', p_instance_id, v_pi.package_id,
      v_title,
      '<p><strong>The hours on this package differ from the standard allowance.</strong> '
        || 'Each change is listed below; the full history is in the audit log.</p><ul>'
        || v_entry || '</ul>',
      'general', ARRAY['allowance-adjustment'], true, v_actor
    )
    RETURNING id INTO v_note_id;
  ELSE
    UPDATE public.notes
    SET title = v_title,
        note_details = CASE
          WHEN rtrim(v_note_html) LIKE '%</ul>'
            THEN left(rtrim(v_note_html), length(rtrim(v_note_html)) - 5) || v_entry || '</ul>'
          ELSE v_note_html || '<ul>' || v_entry || '</ul>'
        END,
        is_pinned = true,
        updated_at = now()
    WHERE id = v_note_id;
  END IF;

  INSERT INTO public.client_audit_log
    (tenant_id, actor_user_id, action, entity_type, entity_id, details, before_data, after_data)
  VALUES (
    v_pi.tenant_id,
    v_actor,
    'package_allowance_adjusted',
    'package_instances',
    p_instance_id::text,
    jsonb_build_object(
      'reason', v_reason,
      'hours_delta', round(v_delta_min / 60.0, 2),
      'note_id', v_note_id
    ),
    jsonb_build_object('included_minutes', v_base_min),
    jsonb_build_object('included_minutes', v_new_min)
  );

  RETURN jsonb_build_object(
    'package_instance_id', p_instance_id,
    'previous_minutes', v_base_min,
    'new_minutes', v_new_min,
    'previous_hours', round(v_base_min / 60.0, 2),
    'new_hours', round(v_new_min / 60.0, 2),
    'note_id', v_note_id
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.adjust_package_allowance(bigint, numeric, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.adjust_package_allowance(bigint, numeric, text) FROM anon;
GRANT EXECUTE ON FUNCTION public.adjust_package_allowance(bigint, numeric, text) TO authenticated;
