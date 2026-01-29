-- Create public.client_task_instances matching unicorn1 structure
CREATE TABLE public.client_task_instances (
  id bigint PRIMARY KEY,
  client_task_id integer NOT NULL REFERENCES public.client_tasks(id),
  stage_instance_id bigint NOT NULL REFERENCES public.stage_instances(id),
  status integer NOT NULL DEFAULT 0,
  due_date timestamptz,
  completion_date timestamptz,
  created_at timestamptz DEFAULT now(),
  u1_id bigint,
  CONSTRAINT client_task_instances_u1_id_key UNIQUE (u1_id)
);

-- Indexes for lookups
CREATE INDEX idx_client_task_instances_client_task_id ON public.client_task_instances(client_task_id);
CREATE INDEX idx_client_task_instances_stage_instance_id ON public.client_task_instances(stage_instance_id);
CREATE INDEX idx_client_task_instances_status ON public.client_task_instances(status);

-- Enable RLS
ALTER TABLE public.client_task_instances ENABLE ROW LEVEL SECURITY;

-- Read policy for authenticated users
CREATE POLICY "client_task_instances_read_authenticated"
ON public.client_task_instances FOR SELECT
TO authenticated USING (true);

-- Sync 22,444 records from unicorn1.client_task_instances
INSERT INTO public.client_task_instances (id, client_task_id, stage_instance_id, status, due_date, completion_date, u1_id)
SELECT
  id,
  clienttask_id,
  stageinstance_id,
  status,
  due_date,
  completion_date,
  id
FROM unicorn1.client_task_instances
ON CONFLICT (id) DO NOTHING;

-- Add table comment
COMMENT ON TABLE public.client_task_instances IS 'Client task instances per stage instance - synced from unicorn1.client_task_instances';