-- ===========================================
-- Fix: entity_id UUID type mismatch in audit logging
-- ===========================================

-- Update log_eos_audit_event to accept UUID for entity_id
CREATE OR REPLACE FUNCTION public.log_eos_audit_event(
  p_tenant_id bigint,
  p_user_id uuid,
  p_meeting_id uuid,
  p_entity text,
  p_entity_id uuid,  -- Changed from text to uuid
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

-- Update audit_issue_changes trigger to pass UUID directly (no text cast)
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
  v_entity_id uuid;
BEGIN
  -- Capture the entity ID as UUID
  v_entity_id := COALESCE(NEW.id, OLD.id);
  
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
  
  -- Log the audit event with UUID entity_id (no text cast)
  PERFORM public.log_eos_audit_event(
    COALESCE(NEW.tenant_id, OLD.tenant_id),
    auth.uid(),
    COALESCE(NEW.meeting_id, OLD.meeting_id),
    'issue',
    v_entity_id,  -- Pass UUID directly
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