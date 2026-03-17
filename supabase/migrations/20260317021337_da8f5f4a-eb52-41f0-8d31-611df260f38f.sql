
-- Step 1: Insert 'cancelled' into dd_membership_state
INSERT INTO public.dd_membership_state (code, value, description, seq)
VALUES (6, 'cancelled', 'Cancelled', 6)
ON CONFLICT (value) DO NOTHING;

-- Step 2: Update transition_membership_state to handle cancelled state
CREATE OR REPLACE FUNCTION public.transition_membership_state(
  p_instance_id bigint,
  p_new_state text,
  p_reason text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_old_state text;
  v_tenant_id bigint;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM dd_membership_state WHERE value = p_new_state) THEN
    RAISE EXCEPTION 'Invalid membership state: %', p_new_state;
  END IF;

  SELECT membership_state, tenant_id INTO v_old_state, v_tenant_id
  FROM package_instances
  WHERE id = p_instance_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Package instance % not found', p_instance_id;
  END IF;

  UPDATE package_instances
  SET membership_state = p_new_state,
      is_complete = (p_new_state IN ('complete', 'cancelled')),
      is_active = (p_new_state NOT IN ('complete', 'cancelled')),
      end_date = CASE WHEN p_new_state IN ('complete', 'cancelled') THEN COALESCE(end_date, now()) ELSE end_date END
  WHERE id = p_instance_id;

  INSERT INTO package_instance_state_log (package_instance_id, old_state, new_state, reason, changed_by)
  VALUES (p_instance_id, v_old_state, p_new_state, p_reason, auth.uid());

  IF p_new_state = 'warning' THEN
    UPDATE tenants SET status = 'warning' WHERE id = v_tenant_id;
  END IF;
END;
$$;

-- Step 3: Update the sync trigger to handle cancelled
CREATE OR REPLACE FUNCTION public.fn_sync_package_instance_flags()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF NEW.membership_state IN ('complete', 'cancelled') THEN
    NEW.is_complete := true;
    NEW.is_active := false;
  ELSE
    NEW.is_complete := false;
    NEW.is_active := true;
  END IF;
  RETURN NEW;
END;
$$;
