
-- 1a. app_settings: two new URL columns
ALTER TABLE public.app_settings
  ADD COLUMN IF NOT EXISTS staff_induction_video_url text NULL,
  ADD COLUMN IF NOT EXISTS staff_onboarding_workbook_url text NULL;

-- 1b. staff_provisioning_runs: tracking columns for hub deliverables
ALTER TABLE public.staff_provisioning_runs
  ADD COLUMN IF NOT EXISTS induction_video_sent_at timestamptz NULL,
  ADD COLUMN IF NOT EXISTS induction_video_sent_by uuid NULL,
  ADD COLUMN IF NOT EXISTS induction_video_watched_at timestamptz NULL,
  ADD COLUMN IF NOT EXISTS onboarding_workbook_sent_at timestamptz NULL,
  ADD COLUMN IF NOT EXISTS onboarding_workbook_sent_by uuid NULL,
  ADD COLUMN IF NOT EXISTS onboarding_workbook_returned_at timestamptz NULL,
  ADD COLUMN IF NOT EXISTS welcome_email_sent_at timestamptz NULL,
  ADD COLUMN IF NOT EXISTS welcome_email_sent_by uuid NULL,
  ADD COLUMN IF NOT EXISTS welcome_email_notes text NULL;

-- 1c. Seed dd_lifecycle_responsible_role 'admin' if not present
INSERT INTO public.dd_lifecycle_responsible_role (code, label, description, sort_order, is_active)
SELECT 'admin', 'Admin', 'Vivacity administrator (Angela/Dave)', 100, true
WHERE NOT EXISTS (SELECT 1 FROM public.dd_lifecycle_responsible_role WHERE code = 'admin');

-- 1d. Seed staff_onboarding lifecycle templates (idempotent)
INSERT INTO public.lifecycle_checklist_templates
  (lifecycle_type, category, step_title, responsible_role, sort_order, is_default, is_active)
SELECT * FROM (VALUES
  ('staff_onboarding','induction_training','Induction video link sent to team member','admin',10,true,true),
  ('staff_onboarding','induction_training','Team member confirmed video watched','admin',20,true,true),
  ('staff_onboarding','onboarding_documents','Onboarding Workbook sent to team member','admin',30,true,true),
  ('staff_onboarding','onboarding_documents','Signed workbook acknowledgements returned','admin',40,true,true),
  ('staff_onboarding','communications','Welcome email sent','admin',50,true,true),
  ('staff_onboarding','communications','Team member replied and confirmed receipt','admin',60,true,true),
  ('staff_onboarding','system_access','Microsoft 365 invitation accepted','admin',70,true,true),
  ('staff_onboarding','system_access','Unicorn access confirmed and first login completed','admin',80,true,true),
  ('staff_onboarding','system_access','First Daily Huddle attended','admin',90,true,true)
) AS v(lifecycle_type, category, step_title, responsible_role, sort_order, is_default, is_active)
WHERE NOT EXISTS (
  SELECT 1 FROM public.lifecycle_checklist_templates t
  WHERE t.lifecycle_type = v.lifecycle_type AND t.sort_order = v.sort_order
);

-- 1e. Trigger: auto-create staff_onboarding checklist instances when status -> 'provisioned'
CREATE OR REPLACE FUNCTION public.tg_seed_staff_onboarding_checklist()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF NEW.status IS DISTINCT FROM 'provisioned' THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE' AND OLD.status = 'provisioned' THEN
    RETURN NEW;
  END IF;

  -- Idempotent guard
  IF EXISTS (
    SELECT 1 FROM public.lifecycle_checklist_instances
    WHERE provisioning_run_id = NEW.id
      AND lifecycle_type = 'staff_onboarding'
  ) THEN
    RETURN NEW;
  END IF;

  INSERT INTO public.lifecycle_checklist_instances
    (template_id, lifecycle_type, target_user_id, provisioning_run_id, assigned_to, completed)
  SELECT t.id, 'staff_onboarding', NEW.target_user_id, NEW.id, NEW.requested_by, false
  FROM public.lifecycle_checklist_templates t
  WHERE t.lifecycle_type = 'staff_onboarding' AND t.is_active = true
  ORDER BY t.sort_order;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_seed_staff_onboarding_checklist ON public.staff_provisioning_runs;
CREATE TRIGGER trg_seed_staff_onboarding_checklist
AFTER INSERT OR UPDATE OF status ON public.staff_provisioning_runs
FOR EACH ROW
EXECUTE FUNCTION public.tg_seed_staff_onboarding_checklist();
