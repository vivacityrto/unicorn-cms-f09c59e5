-- ============================================================
-- EOS VIVACITY-ONLY MIGRATION
-- Makes all EOS features internal to Vivacity Team
-- ============================================================

-- 1) Create eos_workspaces table for internal workspace scoping
CREATE TABLE IF NOT EXISTS public.eos_workspaces (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug text UNIQUE NOT NULL,
  name text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Insert the Vivacity internal workspace
INSERT INTO public.eos_workspaces (slug, name)
VALUES ('vivacity', 'Vivacity Internal')
ON CONFLICT (slug) DO NOTHING;

-- Enable RLS on workspaces
ALTER TABLE public.eos_workspaces ENABLE ROW LEVEL SECURITY;

-- 2) Create helper function to get the Vivacity workspace ID
CREATE OR REPLACE FUNCTION public.get_vivacity_workspace_id()
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT id FROM public.eos_workspaces WHERE slug = 'vivacity' LIMIT 1;
$$;

-- 3) Add workspace_id to key EOS tables
-- We'll add the column, backfill from existing data, then set NOT NULL

-- EOS_MEETINGS
ALTER TABLE public.eos_meetings 
  ADD COLUMN IF NOT EXISTS workspace_id uuid;

UPDATE public.eos_meetings 
SET workspace_id = public.get_vivacity_workspace_id()
WHERE workspace_id IS NULL;

ALTER TABLE public.eos_meetings 
  ALTER COLUMN workspace_id SET DEFAULT public.get_vivacity_workspace_id();

-- EOS_ROCKS
ALTER TABLE public.eos_rocks 
  ADD COLUMN IF NOT EXISTS workspace_id uuid;

UPDATE public.eos_rocks 
SET workspace_id = public.get_vivacity_workspace_id()
WHERE workspace_id IS NULL;

ALTER TABLE public.eos_rocks 
  ALTER COLUMN workspace_id SET DEFAULT public.get_vivacity_workspace_id();

-- EOS_ISSUES (risks/opportunities)
ALTER TABLE public.eos_issues 
  ADD COLUMN IF NOT EXISTS workspace_id uuid;

UPDATE public.eos_issues 
SET workspace_id = public.get_vivacity_workspace_id()
WHERE workspace_id IS NULL;

ALTER TABLE public.eos_issues 
  ALTER COLUMN workspace_id SET DEFAULT public.get_vivacity_workspace_id();

-- EOS_QC (quarterly conversations)
ALTER TABLE public.eos_qc 
  ADD COLUMN IF NOT EXISTS workspace_id uuid;

UPDATE public.eos_qc 
SET workspace_id = public.get_vivacity_workspace_id()
WHERE workspace_id IS NULL;

ALTER TABLE public.eos_qc 
  ALTER COLUMN workspace_id SET DEFAULT public.get_vivacity_workspace_id();

-- EOS_TODOS
ALTER TABLE public.eos_todos 
  ADD COLUMN IF NOT EXISTS workspace_id uuid;

UPDATE public.eos_todos 
SET workspace_id = public.get_vivacity_workspace_id()
WHERE workspace_id IS NULL;

ALTER TABLE public.eos_todos 
  ALTER COLUMN workspace_id SET DEFAULT public.get_vivacity_workspace_id();

-- EOS_HEADLINES
ALTER TABLE public.eos_headlines 
  ADD COLUMN IF NOT EXISTS workspace_id uuid;

UPDATE public.eos_headlines 
SET workspace_id = public.get_vivacity_workspace_id()
WHERE workspace_id IS NULL;

ALTER TABLE public.eos_headlines 
  ALTER COLUMN workspace_id SET DEFAULT public.get_vivacity_workspace_id();

-- EOS_SCORECARD_METRICS
ALTER TABLE public.eos_scorecard_metrics 
  ADD COLUMN IF NOT EXISTS workspace_id uuid;

UPDATE public.eos_scorecard_metrics 
SET workspace_id = public.get_vivacity_workspace_id()
WHERE workspace_id IS NULL;

ALTER TABLE public.eos_scorecard_metrics 
  ALTER COLUMN workspace_id SET DEFAULT public.get_vivacity_workspace_id();

-- EOS_SCORECARD_ENTRIES
ALTER TABLE public.eos_scorecard_entries 
  ADD COLUMN IF NOT EXISTS workspace_id uuid;

UPDATE public.eos_scorecard_entries 
SET workspace_id = public.get_vivacity_workspace_id()
WHERE workspace_id IS NULL;

ALTER TABLE public.eos_scorecard_entries 
  ALTER COLUMN workspace_id SET DEFAULT public.get_vivacity_workspace_id();

-- EOS_VTO
ALTER TABLE public.eos_vto 
  ADD COLUMN IF NOT EXISTS workspace_id uuid;

UPDATE public.eos_vto 
SET workspace_id = public.get_vivacity_workspace_id()
WHERE workspace_id IS NULL;

ALTER TABLE public.eos_vto 
  ALTER COLUMN workspace_id SET DEFAULT public.get_vivacity_workspace_id();

-- EOS_MEETING_SERIES
ALTER TABLE public.eos_meeting_series 
  ADD COLUMN IF NOT EXISTS workspace_id uuid;

UPDATE public.eos_meeting_series 
SET workspace_id = public.get_vivacity_workspace_id()
WHERE workspace_id IS NULL;

ALTER TABLE public.eos_meeting_series 
  ALTER COLUMN workspace_id SET DEFAULT public.get_vivacity_workspace_id();

-- 4) Add indexes on workspace_id for performance
CREATE INDEX IF NOT EXISTS idx_eos_meetings_workspace ON public.eos_meetings(workspace_id);
CREATE INDEX IF NOT EXISTS idx_eos_rocks_workspace ON public.eos_rocks(workspace_id);
CREATE INDEX IF NOT EXISTS idx_eos_issues_workspace ON public.eos_issues(workspace_id);
CREATE INDEX IF NOT EXISTS idx_eos_qc_workspace ON public.eos_qc(workspace_id);
CREATE INDEX IF NOT EXISTS idx_eos_todos_workspace ON public.eos_todos(workspace_id);
CREATE INDEX IF NOT EXISTS idx_eos_headlines_workspace ON public.eos_headlines(workspace_id);
CREATE INDEX IF NOT EXISTS idx_eos_scorecard_metrics_workspace ON public.eos_scorecard_metrics(workspace_id);
CREATE INDEX IF NOT EXISTS idx_eos_scorecard_entries_workspace ON public.eos_scorecard_entries(workspace_id);
CREATE INDEX IF NOT EXISTS idx_eos_vto_workspace ON public.eos_vto(workspace_id);
CREATE INDEX IF NOT EXISTS idx_eos_meeting_series_workspace ON public.eos_meeting_series(workspace_id);

-- 5) Add foreign key constraints to eos_workspaces
ALTER TABLE public.eos_meetings 
  DROP CONSTRAINT IF EXISTS fk_eos_meetings_workspace,
  ADD CONSTRAINT fk_eos_meetings_workspace 
  FOREIGN KEY (workspace_id) REFERENCES public.eos_workspaces(id);

ALTER TABLE public.eos_rocks 
  DROP CONSTRAINT IF EXISTS fk_eos_rocks_workspace,
  ADD CONSTRAINT fk_eos_rocks_workspace 
  FOREIGN KEY (workspace_id) REFERENCES public.eos_workspaces(id);

ALTER TABLE public.eos_issues 
  DROP CONSTRAINT IF EXISTS fk_eos_issues_workspace,
  ADD CONSTRAINT fk_eos_issues_workspace 
  FOREIGN KEY (workspace_id) REFERENCES public.eos_workspaces(id);

ALTER TABLE public.eos_qc 
  DROP CONSTRAINT IF EXISTS fk_eos_qc_workspace,
  ADD CONSTRAINT fk_eos_qc_workspace 
  FOREIGN KEY (workspace_id) REFERENCES public.eos_workspaces(id);

ALTER TABLE public.eos_todos 
  DROP CONSTRAINT IF EXISTS fk_eos_todos_workspace,
  ADD CONSTRAINT fk_eos_todos_workspace 
  FOREIGN KEY (workspace_id) REFERENCES public.eos_workspaces(id);

ALTER TABLE public.eos_headlines 
  DROP CONSTRAINT IF EXISTS fk_eos_headlines_workspace,
  ADD CONSTRAINT fk_eos_headlines_workspace 
  FOREIGN KEY (workspace_id) REFERENCES public.eos_workspaces(id);

ALTER TABLE public.eos_scorecard_metrics 
  DROP CONSTRAINT IF EXISTS fk_eos_scorecard_metrics_workspace,
  ADD CONSTRAINT fk_eos_scorecard_metrics_workspace 
  FOREIGN KEY (workspace_id) REFERENCES public.eos_workspaces(id);

ALTER TABLE public.eos_scorecard_entries 
  DROP CONSTRAINT IF EXISTS fk_eos_scorecard_entries_workspace,
  ADD CONSTRAINT fk_eos_scorecard_entries_workspace 
  FOREIGN KEY (workspace_id) REFERENCES public.eos_workspaces(id);

ALTER TABLE public.eos_vto 
  DROP CONSTRAINT IF EXISTS fk_eos_vto_workspace,
  ADD CONSTRAINT fk_eos_vto_workspace 
  FOREIGN KEY (workspace_id) REFERENCES public.eos_workspaces(id);

ALTER TABLE public.eos_meeting_series 
  DROP CONSTRAINT IF EXISTS fk_eos_meeting_series_workspace,
  ADD CONSTRAINT fk_eos_meeting_series_workspace 
  FOREIGN KEY (workspace_id) REFERENCES public.eos_workspaces(id);

-- 6) RLS POLICIES: Vivacity Team Only Access
-- Drop existing policies and create new ones

-- EOS_WORKSPACES policies
DROP POLICY IF EXISTS "Vivacity team can view workspaces" ON public.eos_workspaces;
CREATE POLICY "Vivacity team can view workspaces"
  ON public.eos_workspaces FOR SELECT
  TO authenticated
  USING (public.is_vivacity_team_user(auth.uid()));

-- EOS_MEETINGS policies  
DROP POLICY IF EXISTS "Vivacity team can view meetings" ON public.eos_meetings;
DROP POLICY IF EXISTS "Vivacity team can insert meetings" ON public.eos_meetings;
DROP POLICY IF EXISTS "Vivacity team can update meetings" ON public.eos_meetings;
DROP POLICY IF EXISTS "Vivacity team can delete meetings" ON public.eos_meetings;

CREATE POLICY "Vivacity team can view meetings"
  ON public.eos_meetings FOR SELECT
  TO authenticated
  USING (public.is_vivacity_team_user(auth.uid()));

CREATE POLICY "Vivacity team can insert meetings"
  ON public.eos_meetings FOR INSERT
  TO authenticated
  WITH CHECK (
    public.is_vivacity_team_user(auth.uid())
    AND (workspace_id IS NULL OR workspace_id = public.get_vivacity_workspace_id())
  );

CREATE POLICY "Vivacity team can update meetings"
  ON public.eos_meetings FOR UPDATE
  TO authenticated
  USING (public.is_vivacity_team_user(auth.uid()))
  WITH CHECK (public.is_vivacity_team_user(auth.uid()));

CREATE POLICY "Vivacity team can delete meetings"
  ON public.eos_meetings FOR DELETE
  TO authenticated
  USING (public.is_vivacity_team_user(auth.uid()));

-- EOS_ROCKS policies
DROP POLICY IF EXISTS "Vivacity team can view rocks" ON public.eos_rocks;
DROP POLICY IF EXISTS "Vivacity team can insert rocks" ON public.eos_rocks;
DROP POLICY IF EXISTS "Vivacity team can update rocks" ON public.eos_rocks;
DROP POLICY IF EXISTS "Vivacity team can delete rocks" ON public.eos_rocks;

CREATE POLICY "Vivacity team can view rocks"
  ON public.eos_rocks FOR SELECT
  TO authenticated
  USING (public.is_vivacity_team_user(auth.uid()));

CREATE POLICY "Vivacity team can insert rocks"
  ON public.eos_rocks FOR INSERT
  TO authenticated
  WITH CHECK (
    public.is_vivacity_team_user(auth.uid())
    AND (workspace_id IS NULL OR workspace_id = public.get_vivacity_workspace_id())
  );

CREATE POLICY "Vivacity team can update rocks"
  ON public.eos_rocks FOR UPDATE
  TO authenticated
  USING (public.is_vivacity_team_user(auth.uid()))
  WITH CHECK (public.is_vivacity_team_user(auth.uid()));

CREATE POLICY "Vivacity team can delete rocks"
  ON public.eos_rocks FOR DELETE
  TO authenticated
  USING (public.is_vivacity_team_user(auth.uid()));

-- EOS_ISSUES policies
DROP POLICY IF EXISTS "Vivacity team can view issues" ON public.eos_issues;
DROP POLICY IF EXISTS "Vivacity team can insert issues" ON public.eos_issues;
DROP POLICY IF EXISTS "Vivacity team can update issues" ON public.eos_issues;
DROP POLICY IF EXISTS "Vivacity team can delete issues" ON public.eos_issues;

CREATE POLICY "Vivacity team can view issues"
  ON public.eos_issues FOR SELECT
  TO authenticated
  USING (public.is_vivacity_team_user(auth.uid()));

CREATE POLICY "Vivacity team can insert issues"
  ON public.eos_issues FOR INSERT
  TO authenticated
  WITH CHECK (
    public.is_vivacity_team_user(auth.uid())
    AND (workspace_id IS NULL OR workspace_id = public.get_vivacity_workspace_id())
  );

CREATE POLICY "Vivacity team can update issues"
  ON public.eos_issues FOR UPDATE
  TO authenticated
  USING (public.is_vivacity_team_user(auth.uid()))
  WITH CHECK (public.is_vivacity_team_user(auth.uid()));

CREATE POLICY "Vivacity team can delete issues"
  ON public.eos_issues FOR DELETE
  TO authenticated
  USING (public.is_vivacity_team_user(auth.uid()));

-- EOS_QC policies
DROP POLICY IF EXISTS "Vivacity team can view qc" ON public.eos_qc;
DROP POLICY IF EXISTS "Vivacity team can insert qc" ON public.eos_qc;
DROP POLICY IF EXISTS "Vivacity team can update qc" ON public.eos_qc;
DROP POLICY IF EXISTS "Vivacity team can delete qc" ON public.eos_qc;

CREATE POLICY "Vivacity team can view qc"
  ON public.eos_qc FOR SELECT
  TO authenticated
  USING (public.is_vivacity_team_user(auth.uid()));

CREATE POLICY "Vivacity team can insert qc"
  ON public.eos_qc FOR INSERT
  TO authenticated
  WITH CHECK (
    public.is_vivacity_team_user(auth.uid())
    AND (workspace_id IS NULL OR workspace_id = public.get_vivacity_workspace_id())
  );

CREATE POLICY "Vivacity team can update qc"
  ON public.eos_qc FOR UPDATE
  TO authenticated
  USING (public.is_vivacity_team_user(auth.uid()))
  WITH CHECK (public.is_vivacity_team_user(auth.uid()));

CREATE POLICY "Vivacity team can delete qc"
  ON public.eos_qc FOR DELETE
  TO authenticated
  USING (public.is_vivacity_team_user(auth.uid()));

-- EOS_TODOS policies
DROP POLICY IF EXISTS "Vivacity team can view todos" ON public.eos_todos;
DROP POLICY IF EXISTS "Vivacity team can insert todos" ON public.eos_todos;
DROP POLICY IF EXISTS "Vivacity team can update todos" ON public.eos_todos;
DROP POLICY IF EXISTS "Vivacity team can delete todos" ON public.eos_todos;

CREATE POLICY "Vivacity team can view todos"
  ON public.eos_todos FOR SELECT
  TO authenticated
  USING (public.is_vivacity_team_user(auth.uid()));

CREATE POLICY "Vivacity team can insert todos"
  ON public.eos_todos FOR INSERT
  TO authenticated
  WITH CHECK (
    public.is_vivacity_team_user(auth.uid())
    AND (workspace_id IS NULL OR workspace_id = public.get_vivacity_workspace_id())
  );

CREATE POLICY "Vivacity team can update todos"
  ON public.eos_todos FOR UPDATE
  TO authenticated
  USING (public.is_vivacity_team_user(auth.uid()))
  WITH CHECK (public.is_vivacity_team_user(auth.uid()));

CREATE POLICY "Vivacity team can delete todos"
  ON public.eos_todos FOR DELETE
  TO authenticated
  USING (public.is_vivacity_team_user(auth.uid()));

-- EOS_HEADLINES policies
DROP POLICY IF EXISTS "Vivacity team can view headlines" ON public.eos_headlines;
DROP POLICY IF EXISTS "Vivacity team can insert headlines" ON public.eos_headlines;
DROP POLICY IF EXISTS "Vivacity team can update headlines" ON public.eos_headlines;
DROP POLICY IF EXISTS "Vivacity team can delete headlines" ON public.eos_headlines;

CREATE POLICY "Vivacity team can view headlines"
  ON public.eos_headlines FOR SELECT
  TO authenticated
  USING (public.is_vivacity_team_user(auth.uid()));

CREATE POLICY "Vivacity team can insert headlines"
  ON public.eos_headlines FOR INSERT
  TO authenticated
  WITH CHECK (
    public.is_vivacity_team_user(auth.uid())
    AND (workspace_id IS NULL OR workspace_id = public.get_vivacity_workspace_id())
  );

CREATE POLICY "Vivacity team can update headlines"
  ON public.eos_headlines FOR UPDATE
  TO authenticated
  USING (public.is_vivacity_team_user(auth.uid()))
  WITH CHECK (public.is_vivacity_team_user(auth.uid()));

CREATE POLICY "Vivacity team can delete headlines"
  ON public.eos_headlines FOR DELETE
  TO authenticated
  USING (public.is_vivacity_team_user(auth.uid()));

-- EOS_SCORECARD_METRICS policies
DROP POLICY IF EXISTS "Vivacity team can view scorecard_metrics" ON public.eos_scorecard_metrics;
DROP POLICY IF EXISTS "Vivacity team can insert scorecard_metrics" ON public.eos_scorecard_metrics;
DROP POLICY IF EXISTS "Vivacity team can update scorecard_metrics" ON public.eos_scorecard_metrics;
DROP POLICY IF EXISTS "Vivacity team can delete scorecard_metrics" ON public.eos_scorecard_metrics;

CREATE POLICY "Vivacity team can view scorecard_metrics"
  ON public.eos_scorecard_metrics FOR SELECT
  TO authenticated
  USING (public.is_vivacity_team_user(auth.uid()));

CREATE POLICY "Vivacity team can insert scorecard_metrics"
  ON public.eos_scorecard_metrics FOR INSERT
  TO authenticated
  WITH CHECK (
    public.is_vivacity_team_user(auth.uid())
    AND (workspace_id IS NULL OR workspace_id = public.get_vivacity_workspace_id())
  );

CREATE POLICY "Vivacity team can update scorecard_metrics"
  ON public.eos_scorecard_metrics FOR UPDATE
  TO authenticated
  USING (public.is_vivacity_team_user(auth.uid()))
  WITH CHECK (public.is_vivacity_team_user(auth.uid()));

CREATE POLICY "Vivacity team can delete scorecard_metrics"
  ON public.eos_scorecard_metrics FOR DELETE
  TO authenticated
  USING (public.is_vivacity_team_user(auth.uid()));

-- EOS_SCORECARD_ENTRIES policies
DROP POLICY IF EXISTS "Vivacity team can view scorecard_entries" ON public.eos_scorecard_entries;
DROP POLICY IF EXISTS "Vivacity team can insert scorecard_entries" ON public.eos_scorecard_entries;
DROP POLICY IF EXISTS "Vivacity team can update scorecard_entries" ON public.eos_scorecard_entries;
DROP POLICY IF EXISTS "Vivacity team can delete scorecard_entries" ON public.eos_scorecard_entries;

CREATE POLICY "Vivacity team can view scorecard_entries"
  ON public.eos_scorecard_entries FOR SELECT
  TO authenticated
  USING (public.is_vivacity_team_user(auth.uid()));

CREATE POLICY "Vivacity team can insert scorecard_entries"
  ON public.eos_scorecard_entries FOR INSERT
  TO authenticated
  WITH CHECK (
    public.is_vivacity_team_user(auth.uid())
    AND (workspace_id IS NULL OR workspace_id = public.get_vivacity_workspace_id())
  );

CREATE POLICY "Vivacity team can update scorecard_entries"
  ON public.eos_scorecard_entries FOR UPDATE
  TO authenticated
  USING (public.is_vivacity_team_user(auth.uid()))
  WITH CHECK (public.is_vivacity_team_user(auth.uid()));

CREATE POLICY "Vivacity team can delete scorecard_entries"
  ON public.eos_scorecard_entries FOR DELETE
  TO authenticated
  USING (public.is_vivacity_team_user(auth.uid()));

-- EOS_VTO policies
DROP POLICY IF EXISTS "Vivacity team can view vto" ON public.eos_vto;
DROP POLICY IF EXISTS "Vivacity team can insert vto" ON public.eos_vto;
DROP POLICY IF EXISTS "Vivacity team can update vto" ON public.eos_vto;
DROP POLICY IF EXISTS "Vivacity team can delete vto" ON public.eos_vto;

CREATE POLICY "Vivacity team can view vto"
  ON public.eos_vto FOR SELECT
  TO authenticated
  USING (public.is_vivacity_team_user(auth.uid()));

CREATE POLICY "Vivacity team can insert vto"
  ON public.eos_vto FOR INSERT
  TO authenticated
  WITH CHECK (
    public.is_vivacity_team_user(auth.uid())
    AND (workspace_id IS NULL OR workspace_id = public.get_vivacity_workspace_id())
  );

CREATE POLICY "Vivacity team can update vto"
  ON public.eos_vto FOR UPDATE
  TO authenticated
  USING (public.is_vivacity_team_user(auth.uid()))
  WITH CHECK (public.is_vivacity_team_user(auth.uid()));

CREATE POLICY "Vivacity team can delete vto"
  ON public.eos_vto FOR DELETE
  TO authenticated
  USING (public.is_vivacity_team_user(auth.uid()));

-- EOS_MEETING_SERIES policies
DROP POLICY IF EXISTS "Vivacity team can view meeting_series" ON public.eos_meeting_series;
DROP POLICY IF EXISTS "Vivacity team can insert meeting_series" ON public.eos_meeting_series;
DROP POLICY IF EXISTS "Vivacity team can update meeting_series" ON public.eos_meeting_series;
DROP POLICY IF EXISTS "Vivacity team can delete meeting_series" ON public.eos_meeting_series;

CREATE POLICY "Vivacity team can view meeting_series"
  ON public.eos_meeting_series FOR SELECT
  TO authenticated
  USING (public.is_vivacity_team_user(auth.uid()));

CREATE POLICY "Vivacity team can insert meeting_series"
  ON public.eos_meeting_series FOR INSERT
  TO authenticated
  WITH CHECK (
    public.is_vivacity_team_user(auth.uid())
    AND (workspace_id IS NULL OR workspace_id = public.get_vivacity_workspace_id())
  );

CREATE POLICY "Vivacity team can update meeting_series"
  ON public.eos_meeting_series FOR UPDATE
  TO authenticated
  USING (public.is_vivacity_team_user(auth.uid()))
  WITH CHECK (public.is_vivacity_team_user(auth.uid()));

CREATE POLICY "Vivacity team can delete meeting_series"
  ON public.eos_meeting_series FOR DELETE
  TO authenticated
  USING (public.is_vivacity_team_user(auth.uid()));

-- 7) Ensure RLS is enabled on all tables
ALTER TABLE public.eos_meetings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.eos_rocks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.eos_issues ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.eos_qc ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.eos_todos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.eos_headlines ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.eos_scorecard_metrics ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.eos_scorecard_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.eos_vto ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.eos_meeting_series ENABLE ROW LEVEL SECURITY;