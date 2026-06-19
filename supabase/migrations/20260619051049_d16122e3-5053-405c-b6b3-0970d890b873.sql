
-- Helper function: is the current user a Vivacity Super Admin or Integrator?
CREATE OR REPLACE FUNCTION public.is_vivacity_admin_role()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.users u
    WHERE u.user_uuid = auth.uid()
      AND u.unicorn_role IN ('Super Admin', 'Integrator')
  );
$$;

-- =========================================================
-- Table 1: staff_engagements
-- =========================================================
CREATE TABLE public.staff_engagements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  person_name text NOT NULL,
  person_email text NOT NULL,
  role text NOT NULL,
  engagement_type text NOT NULL CHECK (engagement_type IN ('contractor','employee')),
  type text NOT NULL CHECK (type IN ('onboarding','offboarding')),
  start_date date NOT NULL,
  status text NOT NULL DEFAULT 'in_progress'
    CHECK (status IN ('in_progress','pending_signoff','completed','cancelled')),
  linked_unicorn_user_id uuid,
  created_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_staff_engagements_status ON public.staff_engagements(status);
CREATE INDEX idx_staff_engagements_created_by ON public.staff_engagements(created_by);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.staff_engagements TO authenticated;
GRANT ALL ON public.staff_engagements TO service_role;

ALTER TABLE public.staff_engagements ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Vivacity admins manage staff_engagements"
  ON public.staff_engagements
  FOR ALL
  TO authenticated
  USING (public.is_vivacity_admin_role())
  WITH CHECK (public.is_vivacity_admin_role());

-- =========================================================
-- Table 2: checklist_item_completions
-- =========================================================
CREATE TABLE public.checklist_item_completions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  engagement_id uuid NOT NULL REFERENCES public.staff_engagements(id) ON DELETE CASCADE,
  item_key text NOT NULL,
  completed_by uuid NOT NULL,
  completed_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (engagement_id, item_key)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.checklist_item_completions TO authenticated;
GRANT ALL ON public.checklist_item_completions TO service_role;

ALTER TABLE public.checklist_item_completions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Vivacity admins manage checklist_item_completions"
  ON public.checklist_item_completions
  FOR ALL
  TO authenticated
  USING (public.is_vivacity_admin_role())
  WITH CHECK (public.is_vivacity_admin_role());

-- =========================================================
-- Table 3: engagement_signoffs
-- =========================================================
CREATE TABLE public.engagement_signoffs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  engagement_id uuid NOT NULL REFERENCES public.staff_engagements(id) ON DELETE CASCADE,
  signoff_role text NOT NULL CHECK (signoff_role IN ('staff_member','operations_manager','ceo')),
  signed_by uuid NOT NULL,
  signed_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (engagement_id, signoff_role)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.engagement_signoffs TO authenticated;
GRANT ALL ON public.engagement_signoffs TO service_role;

ALTER TABLE public.engagement_signoffs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Vivacity admins manage engagement_signoffs"
  ON public.engagement_signoffs
  FOR ALL
  TO authenticated
  USING (public.is_vivacity_admin_role())
  WITH CHECK (public.is_vivacity_admin_role());
