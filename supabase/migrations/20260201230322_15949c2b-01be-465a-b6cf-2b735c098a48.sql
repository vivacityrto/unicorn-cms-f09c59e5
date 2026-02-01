-- Add missing columns to eos_issues table for EOS meeting integration

-- Add source column to track where issues are created from
ALTER TABLE public.eos_issues
  ADD COLUMN IF NOT EXISTS source TEXT DEFAULT 'ad_hoc';

-- Add constraint for valid source values
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'eos_issues_source_check'
  ) THEN
    ALTER TABLE public.eos_issues
      ADD CONSTRAINT eos_issues_source_check 
      CHECK (source IN ('ad_hoc', 'meeting_ids', 'ro_page'));
  END IF;
END $$;

-- Add meeting_segment_id to link issues to specific meeting segments
ALTER TABLE public.eos_issues
  ADD COLUMN IF NOT EXISTS meeting_segment_id UUID 
  REFERENCES public.eos_meeting_segments(id) ON DELETE SET NULL;

-- Create index for meeting segment lookups
CREATE INDEX IF NOT EXISTS idx_eos_issues_meeting_segment_id 
  ON public.eos_issues(meeting_segment_id);

-- Fix the create_issue RPC function to use correct column names and include new fields
CREATE OR REPLACE FUNCTION public.create_issue(
  p_tenant_id bigint,
  p_title text,
  p_description text DEFAULT NULL,
  p_priority text DEFAULT 'medium',
  p_assigned_to uuid DEFAULT NULL,
  p_meeting_id uuid DEFAULT NULL,
  p_linked_rock_id uuid DEFAULT NULL,
  p_meeting_segment_id uuid DEFAULT NULL,
  p_source text DEFAULT 'ad_hoc'
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_issue_id UUID;
  v_priority_int INTEGER;
BEGIN
  -- Convert text priority to integer
  v_priority_int := CASE LOWER(p_priority)
    WHEN 'high' THEN 3
    WHEN 'medium' THEN 2
    WHEN 'low' THEN 1
    ELSE 2
  END;

  INSERT INTO eos_issues (
    tenant_id,
    title,
    description,
    priority,
    assigned_to,
    meeting_id,
    linked_rock_id,
    meeting_segment_id,
    source,
    created_by
  ) VALUES (
    p_tenant_id,
    p_title,
    p_description,
    v_priority_int,
    COALESCE(p_assigned_to, auth.uid()),
    p_meeting_id,
    p_linked_rock_id,
    p_meeting_segment_id,
    p_source,
    auth.uid()
  )
  RETURNING id INTO v_issue_id;

  RETURN v_issue_id;
END;
$$;

-- Grant execute permission on the function
GRANT EXECUTE ON FUNCTION public.create_issue(bigint, text, text, text, uuid, uuid, uuid, uuid, text) TO authenticated;