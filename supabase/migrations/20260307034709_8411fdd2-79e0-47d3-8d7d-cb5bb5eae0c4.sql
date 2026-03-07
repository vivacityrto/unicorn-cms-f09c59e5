
-- Create dd_membership_state lookup table
CREATE TABLE public.dd_membership_state (
  code   integer PRIMARY KEY,
  value  text NOT NULL UNIQUE,
  description text NOT NULL,
  seq    integer NOT NULL DEFAULT 0
);

-- Populate with existing enum values + new warning state
INSERT INTO public.dd_membership_state (code, value, description, seq) VALUES
  (0, 'active',   'Active',   0),
  (1, 'at_risk',  'At Risk',  1),
  (2, 'warning',  'Warning',  2),
  (3, 'paused',   'Paused',   3),
  (4, 'exiting',  'Exiting',  4),
  (5, 'complete', 'Complete', 5);

-- Enable RLS
ALTER TABLE public.dd_membership_state ENABLE ROW LEVEL SECURITY;

-- Read-only policy for authenticated users
CREATE POLICY "dd_membership_state_read" ON public.dd_membership_state
  FOR SELECT TO authenticated USING (true);

-- Add 'warning' to the existing membership_state_enum
ALTER TYPE public.membership_state_enum ADD VALUE IF NOT EXISTS 'warning';

-- Update the transition_membership_state RPC to handle warning -> also set tenant status
CREATE OR REPLACE FUNCTION public.transition_membership_state(
  p_instance_id bigint,
  p_new_state public.membership_state_enum,
  p_reason text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_old_state public.membership_state_enum;
  v_tenant_id bigint;
BEGIN
  -- Get current state and tenant_id
  SELECT membership_state, tenant_id INTO v_old_state, v_tenant_id
  FROM package_instances
  WHERE id = p_instance_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Package instance % not found', p_instance_id;
  END IF;

  -- Update the package instance
  UPDATE package_instances
  SET membership_state = p_new_state,
      is_complete = (p_new_state = 'complete'),
      is_active = (p_new_state != 'complete'),
      end_date = CASE WHEN p_new_state = 'complete' THEN COALESCE(end_date, now()) ELSE end_date END
  WHERE id = p_instance_id;

  -- Log the state change
  INSERT INTO package_instance_state_log (package_instance_id, old_state, new_state, reason, changed_by)
  VALUES (p_instance_id, v_old_state, p_new_state, p_reason, auth.uid());

  -- If transitioning to 'warning', also set tenant status to 'warning'
  IF p_new_state = 'warning' THEN
    UPDATE tenants SET status = 'warning' WHERE id = v_tenant_id;
  END IF;
END;
$$;
