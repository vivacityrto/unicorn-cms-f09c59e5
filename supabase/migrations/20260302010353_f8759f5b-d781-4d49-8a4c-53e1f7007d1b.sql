-- Fix stage_instances sequence to be ahead of max ID
SELECT setval('stage_instances_id_seq', (SELECT MAX(id) FROM stage_instances));