-- Delete all child instance data for package_instance 15173 (Arrow CHC)
DELETE FROM staff_task_instances WHERE stageinstance_id IN (24814, 24815, 24816);
DELETE FROM client_task_instances WHERE stageinstance_id IN (24814, 24815, 24816);
DELETE FROM document_instances WHERE stageinstance_id IN (24814, 24815, 24816);
DELETE FROM email_instances WHERE stageinstance_id IN (24814, 24815, 24816);
DELETE FROM stage_instances WHERE packageinstance_id = 15173;
DELETE FROM package_instances WHERE id = 15173;