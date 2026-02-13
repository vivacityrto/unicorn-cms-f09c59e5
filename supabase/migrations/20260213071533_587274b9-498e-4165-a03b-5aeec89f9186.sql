
-- Create enum type for membership state
CREATE TYPE public.membership_state_enum AS ENUM ('active', 'at_risk', 'paused', 'exiting', 'complete');

-- Add membership_state column to package_instances
ALTER TABLE public.package_instances
ADD COLUMN membership_state public.membership_state_enum NOT NULL DEFAULT 'active';

-- Backfill: set existing complete instances to 'complete'
UPDATE public.package_instances
SET membership_state = 'complete'
WHERE is_complete = true;

-- Create audit table for state transitions
CREATE TABLE public.package_instance_state_log (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  package_instance_id bigint NOT NULL REFERENCES public.package_instances(id),
  old_state public.membership_state_enum,
  new_state public.membership_state_enum NOT NULL,
  reason text,
  changed_by uuid,
  changed_at timestamptz NOT NULL DEFAULT now()
);

-- Enable RLS on the audit log
ALTER TABLE public.package_instance_state_log ENABLE ROW LEVEL SECURITY;

-- RLS: SuperAdmins can read all state logs
CREATE POLICY "SuperAdmins can read state logs"
ON public.package_instance_state_log
FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.users
    WHERE users.user_uuid = auth.uid()
    AND users.role = 'super_admin'
  )
);

-- RLS: SuperAdmins can insert state logs
CREATE POLICY "SuperAdmins can insert state logs"
ON public.package_instance_state_log
FOR INSERT
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.users
    WHERE users.user_uuid = auth.uid()
    AND users.role = 'super_admin'
  )
);

-- Create function to transition membership state with audit logging
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
BEGIN
  -- Get current state
  SELECT membership_state INTO v_old_state
  FROM package_instances
  WHERE id = p_instance_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Package instance % not found', p_instance_id;
  END IF;

  IF v_old_state = p_new_state THEN
    RETURN; -- No-op if same state
  END IF;

  -- Update the state
  UPDATE package_instances
  SET membership_state = p_new_state
  WHERE id = p_instance_id;

  -- Log the transition
  INSERT INTO package_instance_state_log (package_instance_id, old_state, new_state, reason, changed_by)
  VALUES (p_instance_id, v_old_state, p_new_state, p_reason, auth.uid());
END;
$$;

-- Index for fast lookups on the audit log
CREATE INDEX idx_state_log_instance ON public.package_instance_state_log(package_instance_id);
CREATE INDEX idx_state_log_changed_at ON public.package_instance_state_log(changed_at DESC);
