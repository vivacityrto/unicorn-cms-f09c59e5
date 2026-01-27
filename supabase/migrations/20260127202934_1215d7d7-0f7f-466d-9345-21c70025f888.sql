-- Create staff_task_instances table
CREATE TABLE public.staff_task_instances (
  id bigint PRIMARY KEY,
  staff_task_id bigint NOT NULL,
  stage_instance_id bigint NOT NULL,
  status_id integer NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'Not Started',
  completion_date timestamp with time zone,
  due_date timestamp with time zone,
  assigned_date timestamp with time zone,
  notes text,
  assignee_id uuid,
  u1_assignee_id integer,
  u1_id integer,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now()
);

-- Create indexes for performance
CREATE INDEX idx_staff_task_instances_stage_instance_id 
  ON public.staff_task_instances(stage_instance_id);
CREATE INDEX idx_staff_task_instances_staff_task_id 
  ON public.staff_task_instances(staff_task_id);
CREATE INDEX idx_staff_task_instances_assignee_id 
  ON public.staff_task_instances(assignee_id);

-- Enable RLS
ALTER TABLE public.staff_task_instances ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Users can view staff task instances"
  ON public.staff_task_instances
  FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "Users can update staff task instances"
  ON public.staff_task_instances
  FOR UPDATE TO authenticated
  USING (true)
  WITH CHECK (true);