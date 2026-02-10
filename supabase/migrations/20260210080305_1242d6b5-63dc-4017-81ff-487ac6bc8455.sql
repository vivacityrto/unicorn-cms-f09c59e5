-- Create meeting_action_tasks table for action items converted from minutes
CREATE TABLE public.meeting_action_tasks (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id integer NOT NULL REFERENCES public.tenants(id),
  meeting_id uuid NOT NULL,
  minutes_id uuid NOT NULL REFERENCES public.meeting_minutes(id) ON DELETE CASCADE,
  action_id text NOT NULL, -- stable action ID within minutes content
  title text NOT NULL,
  description text,
  due_date date,
  assigned_to_user_uuid uuid REFERENCES public.users(user_uuid),
  assigned_to_role text,
  package_id bigint, -- references packages.id
  status text NOT NULL DEFAULT 'Open',
  source_type text NOT NULL DEFAULT 'meeting_minutes',
  confidence text DEFAULT 'medium',
  created_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Prevent duplicate tasks for the same action item
CREATE UNIQUE INDEX uq_meeting_action_tasks_action ON public.meeting_action_tasks (minutes_id, action_id);

-- Index for querying by meeting, tenant, assignee
CREATE INDEX idx_meeting_action_tasks_meeting ON public.meeting_action_tasks (meeting_id);
CREATE INDEX idx_meeting_action_tasks_tenant ON public.meeting_action_tasks (tenant_id);
CREATE INDEX idx_meeting_action_tasks_assignee ON public.meeting_action_tasks (assigned_to_user_uuid);
CREATE INDEX idx_meeting_action_tasks_package ON public.meeting_action_tasks (package_id);

-- Enable RLS
ALTER TABLE public.meeting_action_tasks ENABLE ROW LEVEL SECURITY;

-- SuperAdmin can do everything
CREATE POLICY "SuperAdmins full access on meeting_action_tasks"
  ON public.meeting_action_tasks
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.users
      WHERE users.user_uuid = auth.uid()
      AND users.role = 'SuperAdmin'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.users
      WHERE users.user_uuid = auth.uid()
      AND users.role = 'SuperAdmin'
    )
  );

-- Assigned users can view their own tasks
CREATE POLICY "Assigned users can view own action tasks"
  ON public.meeting_action_tasks
  FOR SELECT
  USING (assigned_to_user_uuid = auth.uid());

-- Trigger for updated_at
CREATE TRIGGER update_meeting_action_tasks_updated_at
  BEFORE UPDATE ON public.meeting_action_tasks
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();