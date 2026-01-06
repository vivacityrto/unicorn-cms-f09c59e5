-- Create table for stage-level task templates (reusable across packages)
CREATE TABLE IF NOT EXISTS public.stage_task_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  stage_id bigint REFERENCES public.documents_stages(id) ON DELETE CASCADE,
  task_type text NOT NULL CHECK (task_type IN ('team', 'client')),
  name text NOT NULL,
  description text,
  instructions text,
  order_number integer NOT NULL DEFAULT 0,
  owner_role text,
  estimated_hours numeric,
  is_mandatory boolean DEFAULT true,
  due_date_offset integer,
  required_documents text[],
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Enable RLS with SuperAdmin-only policies
ALTER TABLE public.stage_task_templates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "SuperAdmin can view stage task templates"
ON public.stage_task_templates FOR SELECT TO authenticated
USING (public.is_superadmin());

CREATE POLICY "SuperAdmin can insert stage task templates"
ON public.stage_task_templates FOR INSERT TO authenticated
WITH CHECK (public.is_superadmin());

CREATE POLICY "SuperAdmin can update stage task templates"
ON public.stage_task_templates FOR UPDATE TO authenticated
USING (public.is_superadmin());

CREATE POLICY "SuperAdmin can delete stage task templates"
ON public.stage_task_templates FOR DELETE TO authenticated
USING (public.is_superadmin());