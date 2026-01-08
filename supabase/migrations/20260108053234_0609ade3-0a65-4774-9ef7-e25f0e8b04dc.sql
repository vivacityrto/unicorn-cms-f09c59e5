-- Create trigger function for team task completion timeline events
CREATE OR REPLACE FUNCTION public.fn_team_task_completion_timeline()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tenant_id bigint;
  v_package_id bigint;
  v_stage_id bigint;
  v_existing_event_id uuid;
BEGIN
  -- Only fire when status changes to 'done' for the first time
  IF NEW.status = 'done' AND (OLD.status IS DISTINCT FROM 'done') THEN
    -- Set completed_at and completed_by if not already set
    IF NEW.completed_at IS NULL THEN
      NEW.completed_at := now();
    END IF;
    IF NEW.completed_by IS NULL THEN
      NEW.completed_by := auth.uid();
    END IF;
    
    -- Get tenant_id (client_id) from the package chain
    SELECT cp.tenant_id, cp.package_id, cps.stage_id
    INTO v_tenant_id, v_package_id, v_stage_id
    FROM client_package_stages cps
    JOIN client_packages cp ON cp.id = cps.client_package_id
    WHERE cps.id = NEW.client_package_stage_id;
    
    -- Only create timeline event if we have a client context
    IF v_tenant_id IS NOT NULL THEN
      -- Check for existing event to prevent duplicates
      SELECT id INTO v_existing_event_id
      FROM client_timeline_events
      WHERE tenant_id = v_tenant_id
        AND client_id = v_tenant_id::text
        AND event_type = 'task_completed_team'
        AND metadata->>'task_instance_id' = NEW.id::text
      LIMIT 1;
      
      -- Only insert if no existing event
      IF v_existing_event_id IS NULL THEN
        INSERT INTO client_timeline_events (
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
          v_tenant_id::text,
          'task_completed_team',
          'Team task completed: ' || COALESCE(NEW.name, 'Untitled'),
          NEW.instructions,
          'task',
          NEW.id::text,
          jsonb_build_object(
            'task_type', 'team',
            'task_template_id', NEW.template_task_id,
            'task_instance_id', NEW.id,
            'package_id', v_package_id,
            'stage_id', v_stage_id,
            'owner_role', NEW.owner_role,
            'estimated_hours', NEW.estimated_hours,
            'is_mandatory', NEW.is_mandatory
          ),
          NEW.completed_at,
          NEW.completed_by,
          'system'
        );
      END IF;
    END IF;
  END IF;
  
  RETURN NEW;
END;
$$;

-- Create trigger function for client task completion timeline events
CREATE OR REPLACE FUNCTION public.fn_client_task_completion_timeline()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tenant_id bigint;
  v_package_id bigint;
  v_stage_id bigint;
  v_existing_event_id uuid;
BEGIN
  -- Only fire when status changes to 'done' for the first time
  IF NEW.status = 'done' AND (OLD.status IS DISTINCT FROM 'done') THEN
    -- Set completed_at and completed_by if not already set
    IF NEW.completed_at IS NULL THEN
      NEW.completed_at := now();
    END IF;
    IF NEW.completed_by IS NULL THEN
      NEW.completed_by := auth.uid();
    END IF;
    
    -- Get tenant_id (client_id) from the package chain
    SELECT cp.tenant_id, cp.package_id, cps.stage_id
    INTO v_tenant_id, v_package_id, v_stage_id
    FROM client_package_stages cps
    JOIN client_packages cp ON cp.id = cps.client_package_id
    WHERE cps.id = NEW.client_package_stage_id;
    
    -- Only create timeline event if we have a client context
    IF v_tenant_id IS NOT NULL THEN
      -- Check for existing event to prevent duplicates
      SELECT id INTO v_existing_event_id
      FROM client_timeline_events
      WHERE tenant_id = v_tenant_id
        AND client_id = v_tenant_id::text
        AND event_type = 'task_completed_client'
        AND metadata->>'task_instance_id' = NEW.id::text
      LIMIT 1;
      
      -- Only insert if no existing event
      IF v_existing_event_id IS NULL THEN
        INSERT INTO client_timeline_events (
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
          v_tenant_id::text,
          'task_completed_client',
          'Client task completed: ' || COALESCE(NEW.name, 'Untitled'),
          NEW.instructions,
          'task',
          NEW.id::text,
          jsonb_build_object(
            'task_type', 'client',
            'task_template_id', NEW.template_task_id,
            'task_instance_id', NEW.id,
            'package_id', v_package_id,
            'stage_id', v_stage_id,
            'due_at', NEW.due_date
          ),
          NEW.completed_at,
          NEW.completed_by,
          'system'
        );
      END IF;
    END IF;
  END IF;
  
  RETURN NEW;
END;
$$;

-- Create triggers on task tables
DROP TRIGGER IF EXISTS trg_team_task_completion_timeline ON client_team_tasks;
CREATE TRIGGER trg_team_task_completion_timeline
  BEFORE UPDATE ON client_team_tasks
  FOR EACH ROW
  EXECUTE FUNCTION fn_team_task_completion_timeline();

DROP TRIGGER IF EXISTS trg_client_task_completion_timeline ON client_tasks;
CREATE TRIGGER trg_client_task_completion_timeline
  BEFORE UPDATE ON client_tasks
  FOR EACH ROW
  EXECUTE FUNCTION fn_client_task_completion_timeline();

-- Create index on client_timeline_events for deduplication queries
CREATE INDEX IF NOT EXISTS idx_timeline_task_instance 
  ON client_timeline_events ((metadata->>'task_instance_id'))
  WHERE event_type IN ('task_completed_team', 'task_completed_client');