
-- Reset all instance table sequences to be at or ahead of max ID
SELECT setval('package_instances_id_seq', GREATEST((SELECT MAX(id) FROM package_instances), 1));
SELECT setval('stage_instances_id_seq', GREATEST((SELECT MAX(id) FROM stage_instances), 1));
SELECT setval('staff_task_instances_id_seq', GREATEST((SELECT MAX(id) FROM staff_task_instances), 1));
SELECT setval('client_task_instances_id_seq', GREATEST((SELECT MAX(id) FROM client_task_instances), 1));
SELECT setval('emailinstances_id_seq', GREATEST((SELECT MAX(id) FROM email_instances), 1));
SELECT setval('document_instances_id_seq', GREATEST((SELECT MAX(id) FROM document_instances), 1));
