
-- Add Microsoft-specific columns to meetings table
ALTER TABLE public.meetings
  ADD COLUMN IF NOT EXISTS ms_ical_uid text,
  ADD COLUMN IF NOT EXISTS ms_join_url text,
  ADD COLUMN IF NOT EXISTS ms_organizer_email text,
  ADD COLUMN IF NOT EXISTS ms_last_synced_at timestamptz,
  ADD COLUMN IF NOT EXISTS ms_sync_status text NOT NULL DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS ms_sync_error text;

-- Create index on ms_ical_uid for lookups
CREATE INDEX IF NOT EXISTS idx_meetings_ms_ical_uid ON public.meetings (ms_ical_uid) WHERE ms_ical_uid IS NOT NULL;

-- Create meeting_artifacts table
CREATE TABLE public.meeting_artifacts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id integer NOT NULL REFERENCES public.tenants(id),
  meeting_id uuid NOT NULL REFERENCES public.meetings(id) ON DELETE CASCADE,
  artifact_type text NOT NULL,
  title text NOT NULL,
  web_url text,
  drive_id text,
  item_id text,
  captured_at timestamptz NOT NULL DEFAULT now(),
  captured_by uuid NOT NULL,
  metadata jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT meeting_artifacts_type_check CHECK (artifact_type IN ('recording', 'transcript', 'shared_file'))
);

-- Prevent duplicate artifacts per meeting
CREATE UNIQUE INDEX idx_meeting_artifacts_unique 
  ON public.meeting_artifacts (meeting_id, artifact_type, COALESCE(item_id, web_url));

CREATE INDEX idx_meeting_artifacts_meeting ON public.meeting_artifacts (meeting_id);
CREATE INDEX idx_meeting_artifacts_tenant ON public.meeting_artifacts (tenant_id);

-- Enable RLS
ALTER TABLE public.meeting_artifacts ENABLE ROW LEVEL SECURITY;

-- Tenant users can see artifacts for their tenant
CREATE POLICY "meeting_artifacts_select_tenant"
  ON public.meeting_artifacts FOR SELECT
  USING (has_tenant_access_safe(tenant_id::bigint, auth.uid()));

-- Vivacity team can see all (covered by has_tenant_access_safe which checks is_vivacity_internal)

-- Only Vivacity team or meeting owner can insert artifacts
CREATE POLICY "meeting_artifacts_insert_staff_or_owner"
  ON public.meeting_artifacts FOR INSERT
  WITH CHECK (
    is_vivacity_team_safe(auth.uid())
    OR (
      auth.uid() = captured_by
      AND EXISTS (
        SELECT 1 FROM public.meetings m
        WHERE m.id = meeting_id AND m.owner_user_uuid = auth.uid()
      )
    )
  );

-- Only Vivacity team can update/delete
CREATE POLICY "meeting_artifacts_update_staff"
  ON public.meeting_artifacts FOR UPDATE
  USING (is_vivacity_team_safe(auth.uid()));

CREATE POLICY "meeting_artifacts_delete_staff"
  ON public.meeting_artifacts FOR DELETE
  USING (is_vivacity_team_safe(auth.uid()));

-- Update timestamp trigger
CREATE TRIGGER update_meeting_artifacts_updated_at
  BEFORE UPDATE ON public.meeting_artifacts
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();
