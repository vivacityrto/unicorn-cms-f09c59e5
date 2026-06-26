
CREATE TABLE public.stage_message_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  stage_id bigint NOT NULL REFERENCES public.documents_stages(id) ON DELETE CASCADE,
  name text NOT NULL,
  description text,
  body text NOT NULL,
  recipient_type text NOT NULL DEFAULT 'client' CHECK (recipient_type IN ('client','internal')),
  trigger_hint text,
  sort_order integer NOT NULL DEFAULT 1,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES auth.users(id)
);

CREATE INDEX idx_stage_message_templates_stage_id ON public.stage_message_templates(stage_id, sort_order);
CREATE UNIQUE INDEX uq_stage_message_templates_stage_sort_name
  ON public.stage_message_templates(stage_id, sort_order, name);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.stage_message_templates TO authenticated;
GRANT ALL ON public.stage_message_templates TO service_role;

ALTER TABLE public.stage_message_templates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated staff can view stage message templates"
  ON public.stage_message_templates FOR SELECT
  TO authenticated
  USING (public.is_vivacity_staff(auth.uid()));

CREATE POLICY "Admins can insert stage message templates"
  ON public.stage_message_templates FOR INSERT
  TO authenticated
  WITH CHECK (public.is_superadmin());

CREATE POLICY "Admins can update stage message templates"
  ON public.stage_message_templates FOR UPDATE
  TO authenticated
  USING (public.is_superadmin())
  WITH CHECK (public.is_superadmin());

CREATE POLICY "Admins can delete stage message templates"
  ON public.stage_message_templates FOR DELETE
  TO authenticated
  USING (public.is_superadmin());
