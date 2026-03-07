
-- Step 1: Drop the old function that depends on the enum
DROP FUNCTION IF EXISTS public.transition_membership_state(bigint, public.membership_state_enum, text);

-- Step 2: Convert columns from enum to text
ALTER TABLE public.package_instances
  ALTER COLUMN membership_state TYPE text USING membership_state::text;
ALTER TABLE public.package_instances
  ALTER COLUMN membership_state SET DEFAULT 'active';

ALTER TABLE public.package_instance_state_log
  ALTER COLUMN old_state TYPE text USING old_state::text;
ALTER TABLE public.package_instance_state_log
  ALTER COLUMN new_state TYPE text USING new_state::text;

-- Step 3: Now drop the enum
DROP TYPE IF EXISTS public.membership_state_enum;

-- Step 4: Add FK to dd_membership_state
ALTER TABLE public.package_instances
  ADD CONSTRAINT fk_package_instances_membership_state
  FOREIGN KEY (membership_state) REFERENCES public.dd_membership_state(value);

-- Step 5: Recreate function with text params
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
      is_complete = (p_new_state = 'complete'),
      is_active = (p_new_state != 'complete'),
      end_date = CASE WHEN p_new_state = 'complete' THEN COALESCE(end_date, now()) ELSE end_date END
  WHERE id = p_instance_id;

  INSERT INTO package_instance_state_log (package_instance_id, old_state, new_state, reason, changed_by)
  VALUES (p_instance_id, v_old_state, p_new_state, p_reason, auth.uid());

  IF p_new_state = 'warning' THEN
    UPDATE tenants SET status = 'warning' WHERE id = v_tenant_id;
  END IF;
END;
$$;
