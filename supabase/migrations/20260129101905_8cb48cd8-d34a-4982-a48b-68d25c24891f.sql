-- Drop existing empty client_tasks table
DROP TABLE IF EXISTS public.client_tasks CASCADE;

-- Create public.client_tasks as template table matching unicorn1 structure
CREATE TABLE public.client_tasks (
  id integer PRIMARY KEY,
  stage_id integer NOT NULL REFERENCES public.stages(id),
  name text NOT NULL,
  description text,
  instructions text,
  sort_order integer NOT NULL DEFAULT 0,
  due_date_offset integer,
  is_mandatory boolean DEFAULT true,
  created_at timestamptz DEFAULT now(),
  u1_id integer,
  CONSTRAINT client_tasks_u1_id_key UNIQUE (u1_id)
);

-- Index for stage lookups
CREATE INDEX idx_client_tasks_stage_id ON public.client_tasks(stage_id);

-- Enable RLS
ALTER TABLE public.client_tasks ENABLE ROW LEVEL SECURITY;

-- Read policy for authenticated users
CREATE POLICY "client_tasks_read_authenticated"
ON public.client_tasks FOR SELECT
TO authenticated USING (true);

-- Sync 227 records from unicorn1.client_tasks
INSERT INTO public.client_tasks (id, stage_id, name, description, instructions, sort_order, due_date_offset, u1_id)
SELECT
  id,
  stage_id,
  COALESCE(name, 'Unnamed Task'),
  description,
  description,
  COALESCE(ordernumber, 0),
  duedateoffset,
  id
FROM unicorn1.client_tasks
ON CONFLICT (id) DO NOTHING;

-- Add table comment
COMMENT ON TABLE public.client_tasks IS 'Template client tasks per stage - synced from unicorn1.client_tasks';