-- Fix the GTO row label/sort_order and reset sequence
UPDATE dd_governance_framework SET label = 'GTO Compliance', sort_order = 3 WHERE id = 2 AND value = 'GTO';

-- Ensure sequence is set to max id
SELECT setval('public.dd_governance_framework_id_seq', (SELECT MAX(id) FROM dd_governance_framework));