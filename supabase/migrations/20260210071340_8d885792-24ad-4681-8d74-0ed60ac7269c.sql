
-- Add visibility columns to meeting_artifacts
ALTER TABLE public.meeting_artifacts
  ADD COLUMN IF NOT EXISTS visibility text NOT NULL DEFAULT 'internal',
  ADD COLUMN IF NOT EXISTS shared_at timestamptz NULL,
  ADD COLUMN IF NOT EXISTS shared_by uuid NULL;

-- Add constraint for visibility values
ALTER TABLE public.meeting_artifacts
  ADD CONSTRAINT meeting_artifacts_visibility_check
  CHECK (visibility IN ('internal', 'client'));

-- Create meeting_minutes_drafts table for auto-generated minutes
CREATE TABLE IF NOT EXISTS public.meeting_minutes_drafts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id integer NOT NULL,
  meeting_id uuid NOT NULL REFERENCES public.meetings(id) ON DELETE CASCADE,
  title text NOT NULL,
  content text NOT NULL DEFAULT '',
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'published')),
  published_at timestamptz NULL,
  published_by uuid NULL,
  portal_document_id uuid NULL,
  created_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(meeting_id)
);

ALTER TABLE public.meeting_minutes_drafts ENABLE ROW LEVEL SECURITY;

-- RLS for meeting_minutes_drafts: Vivacity team can manage, tenant users can see published
CREATE POLICY "vivacity_team_manage_minutes_drafts"
  ON public.meeting_minutes_drafts
  FOR ALL
  USING (is_vivacity_internal_safe(auth.uid()));

CREATE POLICY "tenant_users_view_published_minutes"
  ON public.meeting_minutes_drafts
  FOR SELECT
  USING (
    status = 'published'
    AND has_tenant_access_safe(tenant_id::bigint, auth.uid())
  );

-- Drop existing RLS policies on meeting_artifacts and recreate with visibility rules
DROP POLICY IF EXISTS "Tenant users can view their meeting artifacts" ON public.meeting_artifacts;
DROP POLICY IF EXISTS "Users can view meeting artifacts for their tenant" ON public.meeting_artifacts;
DROP POLICY IF EXISTS "Vivacity team can view all artifacts" ON public.meeting_artifacts;
DROP POLICY IF EXISTS "Tenant users can view shared artifacts" ON public.meeting_artifacts;

-- Vivacity team sees all artifacts
CREATE POLICY "vivacity_team_view_all_artifacts"
  ON public.meeting_artifacts
  FOR SELECT
  USING (is_vivacity_internal_safe(auth.uid()));

-- Vivacity team can insert/update artifacts
CREATE POLICY "vivacity_team_manage_artifacts"
  ON public.meeting_artifacts
  FOR ALL
  USING (is_vivacity_internal_safe(auth.uid()));

-- Tenant users can only see artifacts with visibility='client'
CREATE POLICY "tenant_users_view_client_artifacts"
  ON public.meeting_artifacts
  FOR SELECT
  USING (
    visibility = 'client'
    AND has_tenant_access_safe(tenant_id::bigint, auth.uid())
    AND NOT is_vivacity_internal_safe(auth.uid())
  );

-- Index for performance
CREATE INDEX IF NOT EXISTS idx_meeting_minutes_drafts_meeting_id ON public.meeting_minutes_drafts(meeting_id);
CREATE INDEX IF NOT EXISTS idx_meeting_minutes_drafts_tenant_id ON public.meeting_minutes_drafts(tenant_id);
CREATE INDEX IF NOT EXISTS idx_meeting_artifacts_visibility ON public.meeting_artifacts(visibility);
