
-- Part A: Update visibility constraint to use 'shared_with_client' instead of 'client'
ALTER TABLE public.meeting_artifacts DROP CONSTRAINT IF EXISTS meeting_artifacts_visibility_check;
ALTER TABLE public.meeting_artifacts
  ADD CONSTRAINT meeting_artifacts_visibility_check
  CHECK (visibility IN ('internal', 'shared_with_client'));

-- Update any existing 'client' values to 'shared_with_client'
UPDATE public.meeting_artifacts SET visibility = 'shared_with_client' WHERE visibility = 'client';

-- Drop old meeting_minutes_drafts table and create proper meeting_minutes
DROP TABLE IF EXISTS public.meeting_minutes_drafts;

CREATE TABLE public.meeting_minutes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id integer NOT NULL,
  meeting_id uuid NOT NULL REFERENCES public.meetings(id) ON DELETE CASCADE,
  version integer NOT NULL DEFAULT 1,
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'published')),
  title text NOT NULL,
  content jsonb NOT NULL DEFAULT '{}'::jsonb,
  pdf_storage_path text NULL,
  pdf_document_id uuid NULL,
  published_at timestamptz NULL,
  published_by uuid NULL,
  created_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_meeting_minutes_meeting_id ON public.meeting_minutes(meeting_id);
CREATE INDEX idx_meeting_minutes_tenant_id ON public.meeting_minutes(tenant_id);

ALTER TABLE public.meeting_minutes ENABLE ROW LEVEL SECURITY;

-- Vivacity team: full access
CREATE POLICY "vivacity_team_manage_minutes"
  ON public.meeting_minutes
  FOR ALL
  USING (is_vivacity_internal_safe(auth.uid()));

-- Client users: can only see published minutes for their tenant
CREATE POLICY "tenant_users_view_published_minutes"
  ON public.meeting_minutes
  FOR SELECT
  USING (
    status = 'published'
    AND has_tenant_access_safe(tenant_id::bigint, auth.uid())
    AND NOT is_vivacity_internal_safe(auth.uid())
  );

-- Update artifact RLS: change 'client' to 'shared_with_client'
DROP POLICY IF EXISTS "tenant_users_view_client_artifacts" ON public.meeting_artifacts;

CREATE POLICY "tenant_users_view_shared_artifacts"
  ON public.meeting_artifacts
  FOR SELECT
  USING (
    visibility = 'shared_with_client'
    AND has_tenant_access_safe(tenant_id::bigint, auth.uid())
    AND NOT is_vivacity_internal_safe(auth.uid())
  );
