-- ===========================================
-- A) Data Model Additions for Meeting Context
-- ===========================================

-- Add meeting_segment_id column if not exists
ALTER TABLE public.eos_issues 
ADD COLUMN IF NOT EXISTS meeting_segment_id uuid REFERENCES public.eos_meeting_segments(id) ON DELETE SET NULL;

-- Add source column with allowed values
ALTER TABLE public.eos_issues 
ADD COLUMN IF NOT EXISTS source text NOT NULL DEFAULT 'ad_hoc';

-- Add constraint for source values
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

-- Create indexes for meeting context queries
CREATE INDEX IF NOT EXISTS idx_eos_issues_meeting_id ON public.eos_issues(meeting_id);
CREATE INDEX IF NOT EXISTS idx_eos_issues_meeting_segment_id ON public.eos_issues(meeting_segment_id);

-- ===========================================
-- B) Status Transitions Table
-- ===========================================

CREATE TABLE IF NOT EXISTS public.eos_issue_status_transitions (
  from_status eos_issue_status NOT NULL,
  to_status eos_issue_status NOT NULL,
  PRIMARY KEY (from_status, to_status)
);

-- Enable RLS on transitions table
ALTER TABLE public.eos_issue_status_transitions ENABLE ROW LEVEL SECURITY;

-- Allow all authenticated users to read transitions
CREATE POLICY "Anyone can read transitions"
  ON public.eos_issue_status_transitions FOR SELECT
  TO authenticated
  USING (true);

-- Populate allowed transitions (comprehensive workflow)
INSERT INTO public.eos_issue_status_transitions (from_status, to_status) VALUES
  -- From Open
  ('Open', 'Discussing'),
  ('Open', 'In Review'),
  ('Open', 'Actioning'),
  ('Open', 'Escalated'),
  ('Open', 'Closed'),
  ('Open', 'Archived'),
  -- From Discussing
  ('Discussing', 'Open'),
  ('Discussing', 'Solved'),
  ('Discussing', 'In Review'),
  ('Discussing', 'Actioning'),
  ('Discussing', 'Escalated'),
  ('Discussing', 'Closed'),
  -- From In Review
  ('In Review', 'Open'),
  ('In Review', 'Discussing'),
  ('In Review', 'Actioning'),
  ('In Review', 'Escalated'),
  ('In Review', 'Closed'),
  -- From Actioning
  ('Actioning', 'Solved'),
  ('Actioning', 'In Review'),
  ('Actioning', 'Escalated'),
  ('Actioning', 'Closed'),
  -- From Escalated
  ('Escalated', 'Open'),
  ('Escalated', 'Discussing'),
  ('Escalated', 'Actioning'),
  ('Escalated', 'Solved'),
  ('Escalated', 'Closed'),
  -- From Solved
  ('Solved', 'Open'),
  ('Solved', 'Closed'),
  ('Solved', 'Archived'),
  -- From Closed
  ('Closed', 'Open'),
  ('Closed', 'Archived')
ON CONFLICT DO NOTHING;

-- ===========================================
-- B) Status Transition Validation Function
-- ===========================================

CREATE OR REPLACE FUNCTION public.is_valid_issue_status_transition(
  p_old_status eos_issue_status,
  p_new_status eos_issue_status
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 
    FROM public.eos_issue_status_transitions
    WHERE from_status = p_old_status 
      AND to_status = p_new_status
  )
  OR p_old_status = p_new_status  -- Same status is always valid
  OR p_old_status IS NULL;  -- Initial insert is always valid
$$;

-- ===========================================
-- E) Audit Logging Helper Function
-- ===========================================

CREATE OR REPLACE FUNCTION public.log_eos_audit_event(
  p_tenant_id bigint,
  p_user_id uuid,
  p_meeting_id uuid,
  p_entity text,
  p_entity_id text,
  p_action text,
  p_reason text DEFAULT NULL,
  p_details jsonb DEFAULT '{}'::jsonb
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_audit_id uuid;
BEGIN
  INSERT INTO public.audit_eos_events (
    tenant_id, user_id, meeting_id, entity, entity_id, action, reason, details
  ) VALUES (
    p_tenant_id, p_user_id, p_meeting_id, p_entity, p_entity_id, p_action, p_reason, p_details
  )
  RETURNING id INTO v_audit_id;
  
  RETURN v_audit_id;
END;
$$;

-- ===========================================
-- C) Meeting-Only Rules Trigger
-- ===========================================

CREATE OR REPLACE FUNCTION public.enforce_issue_meeting_rules()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_meeting_status meeting_status;
  v_is_live boolean;
BEGIN
  -- Only apply rules if issue is linked to a meeting
  IF NEW.meeting_id IS NULL THEN
    RETURN NEW;
  END IF;
  
  -- Get current meeting status
  SELECT status INTO v_meeting_status
  FROM public.eos_meetings
  WHERE id = NEW.meeting_id;
  
  -- Check if meeting is in 'live' state (in_progress)
  v_is_live := v_meeting_status = 'in_progress';
  
  -- During live meeting, block changes to immutable fields
  IF v_is_live AND TG_OP = 'UPDATE' THEN
    -- Block title changes
    IF OLD.title IS DISTINCT FROM NEW.title THEN
      RAISE EXCEPTION 'Cannot change issue title during a live meeting';
    END IF;
    
    -- Block item_type changes
    IF OLD.item_type IS DISTINCT FROM NEW.item_type THEN
      RAISE EXCEPTION 'Cannot change issue type during a live meeting';
    END IF;
    
    -- Block meeting_id changes
    IF OLD.meeting_id IS DISTINCT FROM NEW.meeting_id THEN
      RAISE EXCEPTION 'Cannot change meeting association during a live meeting';
    END IF;
    
    -- Block meeting_segment_id changes
    IF OLD.meeting_segment_id IS DISTINCT FROM NEW.meeting_segment_id THEN
      RAISE EXCEPTION 'Cannot change segment association during a live meeting';
    END IF;
    
    -- Block raised_by changes
    IF OLD.raised_by IS DISTINCT FROM NEW.raised_by THEN
      RAISE EXCEPTION 'Cannot change who raised the issue during a live meeting';
    END IF;
    
    -- Block created_by changes
    IF OLD.created_by IS DISTINCT FROM NEW.created_by THEN
      RAISE EXCEPTION 'Cannot change issue creator during a live meeting';
    END IF;
    
    -- Block tenant_id changes (always immutable anyway)
    IF OLD.tenant_id IS DISTINCT FROM NEW.tenant_id THEN
      RAISE EXCEPTION 'Cannot change tenant association';
    END IF;
  END IF;
  
  -- Validate status transitions (applies to all contexts)
  IF TG_OP = 'UPDATE' AND OLD.status IS DISTINCT FROM NEW.status THEN
    IF NOT public.is_valid_issue_status_transition(OLD.status, NEW.status) THEN
      RAISE EXCEPTION 'Invalid status transition from % to %', OLD.status, NEW.status;
    END IF;
  END IF;
  
  RETURN NEW;
END;
$$;

-- Create trigger for meeting rules
DROP TRIGGER IF EXISTS trg_enforce_issue_meeting_rules ON public.eos_issues;
CREATE TRIGGER trg_enforce_issue_meeting_rules
  BEFORE UPDATE ON public.eos_issues
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_issue_meeting_rules();

-- ===========================================
-- E) Audit Logging Trigger for Issues
-- ===========================================

CREATE OR REPLACE FUNCTION public.audit_issue_changes()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_action text;
  v_details jsonb := '{}'::jsonb;
  v_changed_fields jsonb := '[]'::jsonb;
BEGIN
  IF TG_OP = 'INSERT' THEN
    v_action := 'created';
    v_details := jsonb_build_object(
      'source', NEW.source,
      'title', NEW.title,
      'status', NEW.status::text,
      'item_type', NEW.item_type,
      'meeting_id', NEW.meeting_id,
      'meeting_segment_id', NEW.meeting_segment_id
    );
  ELSIF TG_OP = 'UPDATE' THEN
    -- Determine specific action based on what changed
    IF OLD.status IS DISTINCT FROM NEW.status THEN
      v_action := 'status_changed';
      v_changed_fields := v_changed_fields || jsonb_build_object('field', 'status', 'old', OLD.status::text, 'new', NEW.status::text);
    ELSIF OLD.linked_rock_id IS DISTINCT FROM NEW.linked_rock_id THEN
      v_action := 'linked_rock_changed';
      v_changed_fields := v_changed_fields || jsonb_build_object('field', 'linked_rock_id', 'old', OLD.linked_rock_id, 'new', NEW.linked_rock_id);
    ELSE
      v_action := 'updated';
    END IF;
    
    -- Track all changed fields
    IF OLD.title IS DISTINCT FROM NEW.title THEN
      v_changed_fields := v_changed_fields || jsonb_build_object('field', 'title', 'old', OLD.title, 'new', NEW.title);
    END IF;
    IF OLD.description IS DISTINCT FROM NEW.description THEN
      v_changed_fields := v_changed_fields || jsonb_build_object('field', 'description', 'old', LEFT(OLD.description, 100), 'new', LEFT(NEW.description, 100));
    END IF;
    IF OLD.category IS DISTINCT FROM NEW.category THEN
      v_changed_fields := v_changed_fields || jsonb_build_object('field', 'category', 'old', OLD.category, 'new', NEW.category);
    END IF;
    IF OLD.impact IS DISTINCT FROM NEW.impact THEN
      v_changed_fields := v_changed_fields || jsonb_build_object('field', 'impact', 'old', OLD.impact, 'new', NEW.impact);
    END IF;
    
    v_details := jsonb_build_object('changed_fields', v_changed_fields);
  ELSIF TG_OP = 'DELETE' THEN
    v_action := 'deleted';
    v_details := jsonb_build_object('title', OLD.title, 'status', OLD.status::text);
  END IF;
  
  -- Log the audit event
  PERFORM public.log_eos_audit_event(
    COALESCE(NEW.tenant_id, OLD.tenant_id),
    auth.uid(),
    COALESCE(NEW.meeting_id, OLD.meeting_id),
    'issue',
    COALESCE(NEW.id, OLD.id)::text,
    v_action,
    NULL,
    v_details
  );
  
  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  
  RETURN NEW;
END;
$$;

-- Create audit trigger
DROP TRIGGER IF EXISTS trg_audit_issue_changes ON public.eos_issues;
CREATE TRIGGER trg_audit_issue_changes
  AFTER INSERT OR UPDATE OR DELETE ON public.eos_issues
  FOR EACH ROW
  EXECUTE FUNCTION public.audit_issue_changes();

-- ===========================================
-- B) Updated create_issue RPC with Dynamic Status
-- ===========================================

CREATE OR REPLACE FUNCTION public.create_issue(
  p_tenant_id BIGINT,
  p_source TEXT DEFAULT 'ad_hoc',
  p_title TEXT DEFAULT '',
  p_description TEXT DEFAULT NULL,
  p_priority TEXT DEFAULT 'medium',
  p_client_id UUID DEFAULT NULL,
  p_linked_rock_id UUID DEFAULT NULL,
  p_meeting_id UUID DEFAULT NULL,
  p_meeting_segment_id UUID DEFAULT NULL,
  p_item_type TEXT DEFAULT 'risk',
  p_category TEXT DEFAULT NULL,
  p_impact TEXT DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_issue_id UUID;
  v_priority_int INTEGER;
  v_default_status eos_issue_status;
  v_category text;
BEGIN
  -- Get the first (default) enum value dynamically
  SELECT (enum_range(NULL::eos_issue_status))[1] INTO v_default_status;
  
  -- Convert text priority to integer (high=3, medium=2, low=1)
  v_priority_int := CASE LOWER(p_priority)
    WHEN 'high' THEN 3
    WHEN 'medium' THEN 2
    WHEN 'low' THEN 1
    ELSE 2
  END;
  
  -- Set category: use provided value or default based on source
  v_category := COALESCE(LOWER(p_category), 'strategic');

  -- Insert issue with dynamically derived default status
  INSERT INTO eos_issues (
    tenant_id, client_id, title, description, priority, status, category, impact,
    item_type, raised_by, linked_rock_id, meeting_id, meeting_segment_id, source, created_by
  ) VALUES (
    p_tenant_id, p_client_id, p_title, p_description, v_priority_int, v_default_status,
    v_category, LOWER(p_impact), p_item_type, auth.uid(), p_linked_rock_id, 
    p_meeting_id, p_meeting_segment_id, p_source, auth.uid()
  )
  RETURNING id INTO v_issue_id;

  -- Note: Audit logging is now handled by the trigger

  RETURN v_issue_id;
END;
$$;