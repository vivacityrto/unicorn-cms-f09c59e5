
-- Table to store individual ClickUp comments fetched via API
CREATE TABLE public.clickup_task_comments (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  task_id text NOT NULL,
  comment_id text NOT NULL UNIQUE,
  comment_text text,
  comment_by text,
  comment_by_id bigint,
  comment_by_email text,
  date_created bigint,
  resolved boolean DEFAULT false,
  parent_comment_id text,
  fetched_at timestamptz NOT NULL DEFAULT now(),
  tenant_id integer REFERENCES public.tenants(id)
);

-- Index for fast lookups by task
CREATE INDEX idx_clickup_task_comments_task_id ON public.clickup_task_comments(task_id);
CREATE INDEX idx_clickup_task_comments_tenant_id ON public.clickup_task_comments(tenant_id);

-- Enable RLS
ALTER TABLE public.clickup_task_comments ENABLE ROW LEVEL SECURITY;

-- Staff-only read (same pattern as clickup_tasks)
CREATE POLICY "Staff can view clickup comments"
  ON public.clickup_task_comments FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.users u
      WHERE u.user_uuid = auth.uid()
        AND u.role IN ('SuperAdmin', 'Admin')
    )
  );

-- Service role can insert/update (edge function uses service client)
CREATE POLICY "Service role full access to clickup comments"
  ON public.clickup_task_comments FOR ALL
  USING (auth.role() = 'service_role');
