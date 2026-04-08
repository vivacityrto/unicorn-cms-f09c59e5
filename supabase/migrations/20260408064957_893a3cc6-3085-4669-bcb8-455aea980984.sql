DO $$
DECLARE
  v_si RECORD;
  v_t RECORD;
  v_e RECORD;
  v_d RECORD;
BEGIN
  FOR v_si IN SELECT id, stage_id FROM stage_instances WHERE packageinstance_id = 15178
  LOOP
    -- Staff tasks
    FOR v_t IN SELECT id FROM staff_tasks WHERE stage_id = v_si.stage_id
    LOOP
      INSERT INTO staff_task_instances (stafftask_id, stageinstance_id) VALUES (v_t.id, v_si.id) ON CONFLICT DO NOTHING;
    END LOOP;
    -- Client tasks
    FOR v_t IN SELECT id FROM client_tasks WHERE stage_id = v_si.stage_id
    LOOP
      INSERT INTO client_task_instances (clienttask_id, stageinstance_id) VALUES (v_t.id, v_si.id) ON CONFLICT DO NOTHING;
    END LOOP;
    -- Emails
    FOR v_e IN SELECT id, subject, content FROM emails WHERE stage_id = v_si.stage_id
    LOOP
      INSERT INTO email_instances (email_id, stageinstance_id, subject, content, is_sent) VALUES (v_e.id, v_si.id, v_e.subject, v_e.content, false) ON CONFLICT DO NOTHING;
    END LOOP;
    -- Documents
    FOR v_d IN SELECT id FROM documents WHERE stage::int = v_si.stage_id
    LOOP
      INSERT INTO document_instances (document_id, stageinstance_id, tenant_id) VALUES (v_d.id, v_si.id, 7543) ON CONFLICT DO NOTHING;
    END LOOP;
  END LOOP;
END;
$$