-- Add completed_at and completed_by columns to task tables for proper tracking
ALTER TABLE public.client_team_tasks 
ADD COLUMN IF NOT EXISTS completed_at timestamptz,
ADD COLUMN IF NOT EXISTS completed_by uuid;

ALTER TABLE public.client_tasks
ADD COLUMN IF NOT EXISTS completed_at timestamptz,
ADD COLUMN IF NOT EXISTS completed_by uuid;

-- Create trigger function for team task completion timeline events
CREATE OR REPLACE FUNCTION public.fn_team_task_completion_timeline()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_tenant_id bigint;
  v_package_id bigint;
  v_stage_id bigint;
  v_client_package_id uuid;
  v_existing_count int;
BEGIN
  -- Only fire when status changes to 'done' (first time completion)
  IF NEW.status = 'done' AND (OLD.status IS DISTINCT FROM 'done') THEN
    
    -- Get context from client_package_stages
    SELECT 
      cps.client_package_id,
      cp.tenant_id,
      cp.package_id,
      cps.stage_id
    INTO v_client_package_id, v_tenant_id, v_package_id, v_stage_id
    FROM public.client_package_stages cps
    JOIN public.client_packages cp ON cp.id = cps.client_package_id
    WHERE cps.id = NEW.client_package_stage_id;

    IF v_tenant_id IS NULL THEN
      RETURN NEW;
    END IF;

    -- Check for existing event to prevent duplicates
    SELECT COUNT(*) INTO v_existing_count
    FROM public.client_timeline_events
    WHERE tenant_id = v_tenant_id
      AND client_id = v_tenant_id
      AND event_type = 'task_completed_team'
      AND entity_type = 'team_task'
      AND entity_id = NEW.id::text;

    IF v_existing_count > 0 THEN
      RETURN NEW;
    END IF;

    -- Update the task with completion info
    NEW.completed_at := now();
    NEW.completed_by := auth.uid();

    -- Insert timeline event
    INSERT INTO public.client_timeline_events (
      tenant_id,
      client_id,
      event_type,
      title,
      body,
      entity_type,
      entity_id,
      metadata,
      occurred_at,
      created_by,
      source
    ) VALUES (
      v_tenant_id,
      v_tenant_id,
      'task_completed_team',
      'Team task completed: ' || NEW.name,
      COALESCE(NEW.instructions, ''),
      'team_task',
      NEW.id::text,
      jsonb_build_object(
        'task_type', 'team',
        'task_instance_id', NEW.id,
        'template_task_id', NEW.template_task_id,
        'package_id', v_package_id,
        'stage_id', v_stage_id,
        'client_package_stage_id', NEW.client_package_stage_id,
        'owner_role', NEW.owner_role,
        'is_mandatory', NEW.is_mandatory
      ),
      now(),
      auth.uid(),
      'system'
    );
  END IF;

  RETURN NEW;
END;
$$;

-- Create trigger function for client task completion timeline events
CREATE OR REPLACE FUNCTION public.fn_client_task_completion_timeline()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_tenant_id bigint;
  v_package_id bigint;
  v_stage_id bigint;
  v_client_package_id uuid;
  v_existing_count int;
BEGIN
  -- Only fire when status changes to 'done' (first time completion)
  IF NEW.status = 'done' AND (OLD.status IS DISTINCT FROM 'done') THEN
    
    -- Get context from client_package_stages
    SELECT 
      cps.client_package_id,
      cp.tenant_id,
      cp.package_id,
      cps.stage_id
    INTO v_client_package_id, v_tenant_id, v_package_id, v_stage_id
    FROM public.client_package_stages cps
    JOIN public.client_packages cp ON cp.id = cps.client_package_id
    WHERE cps.id = NEW.client_package_stage_id;

    IF v_tenant_id IS NULL THEN
      RETURN NEW;
    END IF;

    -- Check for existing event to prevent duplicates
    SELECT COUNT(*) INTO v_existing_count
    FROM public.client_timeline_events
    WHERE tenant_id = v_tenant_id
      AND client_id = v_tenant_id
      AND event_type = 'task_completed_client'
      AND entity_type = 'client_task'
      AND entity_id = NEW.id::text;

    IF v_existing_count > 0 THEN
      RETURN NEW;
    END IF;

    -- Update the task with completion info
    NEW.completed_at := now();
    NEW.completed_by := auth.uid();

    -- Insert timeline event
    INSERT INTO public.client_timeline_events (
      tenant_id,
      client_id,
      event_type,
      title,
      body,
      entity_type,
      entity_id,
      metadata,
      occurred_at,
      created_by,
      source
    ) VALUES (
      v_tenant_id,
      v_tenant_id,
      'task_completed_client',
      'Client task completed: ' || NEW.name,
      COALESCE(NEW.instructions, ''),
      'client_task',
      NEW.id::text,
      jsonb_build_object(
        'task_type', 'client',
        'task_instance_id', NEW.id,
        'template_task_id', NEW.template_task_id,
        'package_id', v_package_id,
        'stage_id', v_stage_id,
        'client_package_stage_id', NEW.client_package_stage_id,
        'due_date', NEW.due_date
      ),
      now(),
      auth.uid(),
      'system'
    );
  END IF;

  RETURN NEW;
END;
$$;

-- Create triggers
DROP TRIGGER IF EXISTS trg_team_task_completion_timeline ON public.client_team_tasks;
CREATE TRIGGER trg_team_task_completion_timeline
BEFORE UPDATE ON public.client_team_tasks
FOR EACH ROW
EXECUTE FUNCTION public.fn_team_task_completion_timeline();

DROP TRIGGER IF EXISTS trg_client_task_completion_timeline ON public.client_tasks;
CREATE TRIGGER trg_client_task_completion_timeline
BEFORE UPDATE ON public.client_tasks
FOR EACH ROW
EXECUTE FUNCTION public.fn_client_task_completion_timeline();

-- Add comment for event types
COMMENT ON TABLE public.client_timeline_events IS 'Event types: meeting_synced, time_posted, time_ignored, email_sent, email_failed, document_uploaded, document_downloaded, note_added, note_created, note_pinned, note_unpinned, task_completed_team, task_completed_client';