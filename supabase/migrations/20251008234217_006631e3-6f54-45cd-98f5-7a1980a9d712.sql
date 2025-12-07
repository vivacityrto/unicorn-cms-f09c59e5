-- Phase 1: EOS Foundation - Missing Components Only

-- ============================================================================
-- MISSING ENUMS
-- ============================================================================

-- Create eos_role enum (for user roles)
CREATE TYPE public.eos_role AS ENUM ('admin', 'facilitator', 'scribe', 'participant', 'client_viewer');

-- Create meeting_status enum
CREATE TYPE public.meeting_status AS ENUM ('scheduled', 'in_progress', 'completed', 'cancelled');

-- Create rock_type enum
CREATE TYPE public.rock_type AS ENUM ('company', 'team', 'individual');

-- Create segment_type enum
CREATE TYPE public.segment_type AS ENUM ('segue', 'scorecard', 'rocks', 'headlines', 'todos', 'ids', 'conclude');

-- ============================================================================
-- MISSING TABLES
-- ============================================================================

-- EOS User Roles (critical for security)
CREATE TABLE public.eos_user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  tenant_id BIGINT NOT NULL,
  role public.eos_role NOT NULL DEFAULT 'participant',
  assigned_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  assigned_by UUID REFERENCES auth.users(id),
  UNIQUE(user_id, tenant_id)
);

-- V/TO Versions (separate from existing eos_vto)
CREATE TABLE public.eos_vto_versions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id BIGINT NOT NULL,
  version_number INTEGER NOT NULL DEFAULT 1,
  is_active BOOLEAN NOT NULL DEFAULT true,
  content JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by UUID NOT NULL REFERENCES auth.users(id),
  notes TEXT,
  UNIQUE(tenant_id, version_number)
);

-- Scorecard Metrics
CREATE TABLE public.eos_scorecard_metrics (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id BIGINT NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  owner_id UUID REFERENCES auth.users(id),
  target_value NUMERIC,
  unit TEXT,
  frequency TEXT DEFAULT 'weekly',
  is_active BOOLEAN NOT NULL DEFAULT true,
  display_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Scorecard Entries
CREATE TABLE public.eos_scorecard_entries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  metric_id UUID NOT NULL REFERENCES public.eos_scorecard_metrics(id) ON DELETE CASCADE,
  tenant_id BIGINT NOT NULL,
  week_ending DATE NOT NULL,
  value NUMERIC NOT NULL,
  notes TEXT,
  entered_by UUID NOT NULL REFERENCES auth.users(id),
  entered_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(metric_id, week_ending)
);

-- ============================================================================
-- INDEXES FOR NEW TABLES
-- ============================================================================

CREATE INDEX idx_eos_user_roles_user_tenant ON public.eos_user_roles(user_id, tenant_id);
CREATE INDEX idx_eos_user_roles_tenant ON public.eos_user_roles(tenant_id);
CREATE INDEX idx_eos_vto_versions_tenant_active ON public.eos_vto_versions(tenant_id, is_active);
CREATE INDEX idx_eos_scorecard_metrics_tenant ON public.eos_scorecard_metrics(tenant_id);
CREATE INDEX idx_eos_scorecard_entries_metric ON public.eos_scorecard_entries(metric_id);
CREATE INDEX idx_eos_scorecard_entries_week ON public.eos_scorecard_entries(week_ending);

-- Add indexes to existing EOS tables if not present
CREATE INDEX IF NOT EXISTS idx_eos_rocks_tenant ON public.eos_rocks(tenant_id);
CREATE INDEX IF NOT EXISTS idx_eos_rocks_owner ON public.eos_rocks(owner_id);
CREATE INDEX IF NOT EXISTS idx_eos_issues_tenant ON public.eos_issues(tenant_id);
CREATE INDEX IF NOT EXISTS idx_eos_todos_tenant ON public.eos_todos(tenant_id);
CREATE INDEX IF NOT EXISTS idx_eos_todos_assigned ON public.eos_todos(assigned_to);
CREATE INDEX IF NOT EXISTS idx_eos_meetings_tenant ON public.eos_meetings(tenant_id);

-- ============================================================================
-- SECURITY DEFINER FUNCTIONS
-- ============================================================================

-- Check if user has specific EOS role for a tenant
CREATE OR REPLACE FUNCTION public.has_eos_role(_user_id UUID, _tenant_id BIGINT, _role public.eos_role)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.eos_user_roles
    WHERE user_id = _user_id
      AND tenant_id = _tenant_id
      AND role = _role
  )
$$;

-- Check if user has ANY EOS role for a tenant
CREATE OR REPLACE FUNCTION public.has_any_eos_role(_user_id UUID, _tenant_id BIGINT)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.eos_user_roles
    WHERE user_id = _user_id
      AND tenant_id = _tenant_id
  )
$$;

-- Check if user is EOS admin for tenant
CREATE OR REPLACE FUNCTION public.is_eos_admin(_user_id UUID, _tenant_id BIGINT)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.has_eos_role(_user_id, _tenant_id, 'admin'::public.eos_role)
$$;

-- Check if user has admin or facilitator role
CREATE OR REPLACE FUNCTION public.can_facilitate_eos(_user_id UUID, _tenant_id BIGINT)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.eos_user_roles
    WHERE user_id = _user_id
      AND tenant_id = _tenant_id
      AND role IN ('admin', 'facilitator')
  )
$$;

-- ============================================================================
-- ROW LEVEL SECURITY
-- ============================================================================

-- Enable RLS on new tables
ALTER TABLE public.eos_user_roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.eos_vto_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.eos_scorecard_metrics ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.eos_scorecard_entries ENABLE ROW LEVEL SECURITY;

-- Enable RLS on existing EOS tables
ALTER TABLE public.eos_vto ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.eos_accountability_chart ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.eos_rocks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.eos_issues ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.eos_todos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.eos_agenda_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.eos_meetings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.eos_meeting_participants ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.eos_meeting_segments ENABLE ROW LEVEL SECURITY;

-- ============================================================================
-- RLS POLICIES
-- ============================================================================

-- EOS User Roles Policies
CREATE POLICY "Users can view their own EOS roles"
  ON public.eos_user_roles FOR SELECT
  USING (auth.uid() = user_id OR is_super_admin());

CREATE POLICY "Admins can manage EOS roles"
  ON public.eos_user_roles FOR ALL
  USING (is_super_admin() OR public.is_eos_admin(auth.uid(), tenant_id))
  WITH CHECK (is_super_admin() OR public.is_eos_admin(auth.uid(), tenant_id));

-- V/TO Versions Policies
CREATE POLICY "Users with EOS access can view V/TO versions"
  ON public.eos_vto_versions FOR SELECT
  USING (public.has_any_eos_role(auth.uid(), tenant_id) OR is_super_admin());

CREATE POLICY "Admins can manage V/TO versions"
  ON public.eos_vto_versions FOR ALL
  USING (public.is_eos_admin(auth.uid(), tenant_id) OR is_super_admin())
  WITH CHECK (public.is_eos_admin(auth.uid(), tenant_id) OR is_super_admin());

-- Legacy V/TO Policies (for existing eos_vto table)
CREATE POLICY "Users with EOS access can view V/TO"
  ON public.eos_vto FOR SELECT
  USING (public.has_any_eos_role(auth.uid(), tenant_id) OR is_super_admin());

CREATE POLICY "Admins can manage V/TO"
  ON public.eos_vto FOR ALL
  USING (public.is_eos_admin(auth.uid(), tenant_id) OR is_super_admin())
  WITH CHECK (public.is_eos_admin(auth.uid(), tenant_id) OR is_super_admin());

-- Accountability Chart Policies
CREATE POLICY "Users with EOS access can view accountability chart"
  ON public.eos_accountability_chart FOR SELECT
  USING (public.has_any_eos_role(auth.uid(), tenant_id) OR is_super_admin());

CREATE POLICY "Admins can manage accountability chart"
  ON public.eos_accountability_chart FOR ALL
  USING (public.is_eos_admin(auth.uid(), tenant_id) OR is_super_admin())
  WITH CHECK (public.is_eos_admin(auth.uid(), tenant_id) OR is_super_admin());

-- Scorecard Metrics Policies
CREATE POLICY "Users with EOS access can view metrics"
  ON public.eos_scorecard_metrics FOR SELECT
  USING (public.has_any_eos_role(auth.uid(), tenant_id) OR is_super_admin());

CREATE POLICY "Admins and facilitators can manage metrics"
  ON public.eos_scorecard_metrics FOR ALL
  USING (public.can_facilitate_eos(auth.uid(), tenant_id) OR is_super_admin())
  WITH CHECK (public.can_facilitate_eos(auth.uid(), tenant_id) OR is_super_admin());

-- Scorecard Entries Policies
CREATE POLICY "Users with EOS access can view scorecard entries"
  ON public.eos_scorecard_entries FOR SELECT
  USING (public.has_any_eos_role(auth.uid(), tenant_id) OR is_super_admin());

CREATE POLICY "Users with EOS access can add scorecard entries"
  ON public.eos_scorecard_entries FOR INSERT
  WITH CHECK (public.has_any_eos_role(auth.uid(), tenant_id) OR is_super_admin());

CREATE POLICY "Users with EOS access can update entries"
  ON public.eos_scorecard_entries FOR UPDATE
  USING (public.has_any_eos_role(auth.uid(), tenant_id) OR is_super_admin())
  WITH CHECK (public.has_any_eos_role(auth.uid(), tenant_id) OR is_super_admin());

-- Rocks Policies
CREATE POLICY "Users with EOS access can view rocks"
  ON public.eos_rocks FOR SELECT
  USING (public.has_any_eos_role(auth.uid(), tenant_id) OR is_super_admin());

CREATE POLICY "Users with EOS access can manage rocks"
  ON public.eos_rocks FOR ALL
  USING (public.has_any_eos_role(auth.uid(), tenant_id) OR is_super_admin())
  WITH CHECK (public.has_any_eos_role(auth.uid(), tenant_id) OR is_super_admin());

-- Issues Policies
CREATE POLICY "Users with EOS access can view issues"
  ON public.eos_issues FOR SELECT
  USING (public.has_any_eos_role(auth.uid(), tenant_id) OR is_super_admin());

CREATE POLICY "Users with EOS access can manage issues"
  ON public.eos_issues FOR ALL
  USING (public.has_any_eos_role(auth.uid(), tenant_id) OR is_super_admin())
  WITH CHECK (public.has_any_eos_role(auth.uid(), tenant_id) OR is_super_admin());

-- To-Dos Policies
CREATE POLICY "Users with EOS access can view todos"
  ON public.eos_todos FOR SELECT
  USING (public.has_any_eos_role(auth.uid(), tenant_id) OR is_super_admin());

CREATE POLICY "Users with EOS access can manage todos"
  ON public.eos_todos FOR ALL
  USING (public.has_any_eos_role(auth.uid(), tenant_id) OR is_super_admin())
  WITH CHECK (public.has_any_eos_role(auth.uid(), tenant_id) OR is_super_admin());

-- Agenda Templates Policies
CREATE POLICY "Users with EOS access can view templates"
  ON public.eos_agenda_templates FOR SELECT
  USING (public.has_any_eos_role(auth.uid(), tenant_id) OR is_super_admin());

CREATE POLICY "Admins can manage templates"
  ON public.eos_agenda_templates FOR ALL
  USING (public.is_eos_admin(auth.uid(), tenant_id) OR is_super_admin())
  WITH CHECK (public.is_eos_admin(auth.uid(), tenant_id) OR is_super_admin());

-- Meetings Policies
CREATE POLICY "Users with EOS access can view meetings"
  ON public.eos_meetings FOR SELECT
  USING (public.has_any_eos_role(auth.uid(), tenant_id) OR is_super_admin());

CREATE POLICY "Facilitators can manage meetings"
  ON public.eos_meetings FOR ALL
  USING (public.can_facilitate_eos(auth.uid(), tenant_id) OR is_super_admin())
  WITH CHECK (public.can_facilitate_eos(auth.uid(), tenant_id) OR is_super_admin());

-- Meeting Participants Policies
CREATE POLICY "Users can view meeting participants"
  ON public.eos_meeting_participants FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.eos_meetings m
      WHERE m.id = meeting_id
        AND (public.has_any_eos_role(auth.uid(), m.tenant_id) OR is_super_admin())
    )
  );

CREATE POLICY "Facilitators can manage participants"
  ON public.eos_meeting_participants FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.eos_meetings m
      WHERE m.id = meeting_id
        AND (public.can_facilitate_eos(auth.uid(), m.tenant_id) OR is_super_admin())
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.eos_meetings m
      WHERE m.id = meeting_id
        AND (public.can_facilitate_eos(auth.uid(), m.tenant_id) OR is_super_admin())
    )
  );

-- Meeting Segments Policies
CREATE POLICY "Users can view meeting segments"
  ON public.eos_meeting_segments FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.eos_meetings m
      WHERE m.id = meeting_id
        AND (public.has_any_eos_role(auth.uid(), m.tenant_id) OR is_super_admin())
    )
  );

CREATE POLICY "Participants can manage segments"
  ON public.eos_meeting_segments FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.eos_meetings m
      WHERE m.id = meeting_id
        AND (public.has_any_eos_role(auth.uid(), m.tenant_id) OR is_super_admin())
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.eos_meetings m
      WHERE m.id = meeting_id
        AND (public.has_any_eos_role(auth.uid(), m.tenant_id) OR is_super_admin())
    )
  );

-- ============================================================================
-- TRIGGERS
-- ============================================================================

CREATE TRIGGER update_eos_scorecard_metrics_updated_at
  BEFORE UPDATE ON public.eos_scorecard_metrics
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();