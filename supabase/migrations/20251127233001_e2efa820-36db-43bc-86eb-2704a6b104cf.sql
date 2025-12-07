
-- Fix the trigger function to use correct type for stage_id (bigint, not uuid)
CREATE OR REPLACE FUNCTION trigger_automated_email_on_task_assignment()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_stage_id bigint;  -- Fixed: was uuid, should be bigint
  v_package_id bigint;
  v_email RECORD;
BEGIN
  -- Only trigger if task was assigned (INSERT with assigned_to or UPDATE where assigned_to changed)
  IF (TG_OP = 'INSERT' AND NEW.assigned_to IS NOT NULL) OR 
     (TG_OP = 'UPDATE' AND NEW.assigned_to IS NOT NULL AND 
      (OLD.assigned_to IS NULL OR OLD.assigned_to != NEW.assigned_to)) THEN
    
    -- Get stage_id from task
    v_stage_id := NEW.stage_id;
    
    -- Skip if no stage_id
    IF v_stage_id IS NULL THEN
      RETURN NEW;
    END IF;
    
    -- Get package_id from stage
    SELECT package_id INTO v_package_id
    FROM package_stages
    WHERE id = v_stage_id;
    
    -- Skip if no package found
    IF v_package_id IS NULL THEN
      RETURN NEW;
    END IF;
    
    -- Find emails configured for this stage with automation enabled
    FOR v_email IN
      SELECT id, name, subject, content, "to"
      FROM emails
      WHERE stage_id = v_stage_id
        AND package_id = v_package_id
        AND auto_send_on_task_assignment = true
        AND automation_enabled = true
    LOOP
      -- Call edge function to process and send email asynchronously
      BEGIN
        PERFORM net.http_post(
          url := 'https://yxkgdalkbrriasiyyrwk.supabase.co/functions/v1/send-automated-email',
          headers := jsonb_build_object(
            'Content-Type', 'application/json',
            'Authorization', 'Bearer ' || current_setting('app.settings.service_role_key', true)
          ),
          body := jsonb_build_object(
            'task_id', NEW.id::text,
            'email_id', v_email.id,
            'trigger_type', 'task_assignment'
          )
        );
      EXCEPTION WHEN OTHERS THEN
        -- Log error but don't fail the task creation
        RAISE WARNING 'Failed to trigger automated email: %', SQLERRM;
      END;
    END LOOP;
  END IF;
  
  RETURN NEW;
END;
$$;
