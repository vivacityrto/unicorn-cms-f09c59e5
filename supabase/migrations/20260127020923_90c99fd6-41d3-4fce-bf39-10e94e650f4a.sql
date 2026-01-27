-- Enhanced field-level audit logging for eos_issues
-- Captures all material field changes with before/after values

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
      'priority', NEW.priority,
      'meeting_id', NEW.meeting_id,
      'meeting_segment_id', NEW.meeting_segment_id,
      'assigned_to', NEW.assigned_to,
      'quarter', jsonb_build_object('number', NEW.quarter_number, 'year', NEW.quarter_year)
    );
  ELSIF TG_OP = 'UPDATE' THEN
    -- Determine primary action based on what changed (priority order)
    IF OLD.status IS DISTINCT FROM NEW.status THEN
      v_action := 'status_changed';
    ELSIF OLD.priority IS DISTINCT FROM NEW.priority THEN
      v_action := 'priority_changed';
    ELSIF OLD.assigned_to IS DISTINCT FROM NEW.assigned_to THEN
      v_action := 'reassigned';
    ELSIF OLD.linked_rock_id IS DISTINCT FROM NEW.linked_rock_id THEN
      v_action := 'linked_rock_changed';
    ELSIF OLD.solution IS DISTINCT FROM NEW.solution THEN
      v_action := 'solution_updated';
    ELSE
      v_action := 'updated';
    END IF;
    
    -- Track ALL changed fields with before/after values
    IF OLD.status IS DISTINCT FROM NEW.status THEN
      v_changed_fields := v_changed_fields || jsonb_build_array(jsonb_build_object(
        'field', 'status', 
        'old', OLD.status::text, 
        'new', NEW.status::text
      ));
    END IF;
    
    IF OLD.title IS DISTINCT FROM NEW.title THEN
      v_changed_fields := v_changed_fields || jsonb_build_array(jsonb_build_object(
        'field', 'title', 
        'old', OLD.title, 
        'new', NEW.title
      ));
    END IF;
    
    IF OLD.description IS DISTINCT FROM NEW.description THEN
      v_changed_fields := v_changed_fields || jsonb_build_array(jsonb_build_object(
        'field', 'description', 
        'old', LEFT(COALESCE(OLD.description, ''), 200), 
        'new', LEFT(COALESCE(NEW.description, ''), 200)
      ));
    END IF;
    
    IF OLD.category IS DISTINCT FROM NEW.category THEN
      v_changed_fields := v_changed_fields || jsonb_build_array(jsonb_build_object(
        'field', 'category', 
        'old', OLD.category, 
        'new', NEW.category
      ));
    END IF;
    
    IF OLD.impact IS DISTINCT FROM NEW.impact THEN
      v_changed_fields := v_changed_fields || jsonb_build_array(jsonb_build_object(
        'field', 'impact', 
        'old', OLD.impact, 
        'new', NEW.impact
      ));
    END IF;
    
    IF OLD.priority IS DISTINCT FROM NEW.priority THEN
      v_changed_fields := v_changed_fields || jsonb_build_array(jsonb_build_object(
        'field', 'priority', 
        'old', OLD.priority, 
        'new', NEW.priority
      ));
    END IF;
    
    IF OLD.solution IS DISTINCT FROM NEW.solution THEN
      v_changed_fields := v_changed_fields || jsonb_build_array(jsonb_build_object(
        'field', 'solution', 
        'old', LEFT(COALESCE(OLD.solution, ''), 200), 
        'new', LEFT(COALESCE(NEW.solution, ''), 200)
      ));
    END IF;
    
    IF OLD.outcome_note IS DISTINCT FROM NEW.outcome_note THEN
      v_changed_fields := v_changed_fields || jsonb_build_array(jsonb_build_object(
        'field', 'outcome_note', 
        'old', LEFT(COALESCE(OLD.outcome_note, ''), 200), 
        'new', LEFT(COALESCE(NEW.outcome_note, ''), 200)
      ));
    END IF;
    
    IF OLD.assigned_to IS DISTINCT FROM NEW.assigned_to THEN
      v_changed_fields := v_changed_fields || jsonb_build_array(jsonb_build_object(
        'field', 'assigned_to', 
        'old', OLD.assigned_to, 
        'new', NEW.assigned_to
      ));
    END IF;
    
    IF OLD.linked_rock_id IS DISTINCT FROM NEW.linked_rock_id THEN
      v_changed_fields := v_changed_fields || jsonb_build_array(jsonb_build_object(
        'field', 'linked_rock_id', 
        'old', OLD.linked_rock_id, 
        'new', NEW.linked_rock_id
      ));
    END IF;
    
    IF OLD.quarter_number IS DISTINCT FROM NEW.quarter_number THEN
      v_changed_fields := v_changed_fields || jsonb_build_array(jsonb_build_object(
        'field', 'quarter_number', 
        'old', OLD.quarter_number, 
        'new', NEW.quarter_number
      ));
    END IF;
    
    IF OLD.quarter_year IS DISTINCT FROM NEW.quarter_year THEN
      v_changed_fields := v_changed_fields || jsonb_build_array(jsonb_build_object(
        'field', 'quarter_year', 
        'old', OLD.quarter_year, 
        'new', NEW.quarter_year
      ));
    END IF;
    
    IF OLD.solved_at IS DISTINCT FROM NEW.solved_at THEN
      v_changed_fields := v_changed_fields || jsonb_build_array(jsonb_build_object(
        'field', 'solved_at', 
        'old', OLD.solved_at, 
        'new', NEW.solved_at
      ));
    END IF;
    
    v_details := jsonb_build_object(
      'changed_fields', v_changed_fields,
      'field_count', jsonb_array_length(v_changed_fields)
    );
  ELSIF TG_OP = 'DELETE' THEN
    v_action := 'deleted';
    v_details := jsonb_build_object(
      'title', OLD.title, 
      'status', OLD.status::text,
      'item_type', OLD.item_type
    );
  END IF;
  
  -- Log the audit event using helper function
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

-- Add comment for documentation
COMMENT ON FUNCTION public.audit_issue_changes() IS 
'Comprehensive field-level audit logging for eos_issues. Captures before/after values for: status, title, description, category, impact, priority, solution, outcome_note, assigned_to, linked_rock_id, quarter_number, quarter_year, solved_at.';