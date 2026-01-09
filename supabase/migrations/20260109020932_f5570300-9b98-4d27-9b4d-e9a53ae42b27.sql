-- Mark tenant 197 as duplicate of 329
-- First add metadata to track the merge
UPDATE tenants 
SET 
  status = 'inactive',
  metadata = COALESCE(metadata, '{}'::jsonb) || jsonb_build_object(
    'merged_into', 329,
    'merged_at', now(),
    'merge_reason', 'Duplicate RTO 91020 - Aboriginal Health & Medical Research Council of NSW'
  )
WHERE id = 197;

-- Add audit log entry for the merge
INSERT INTO client_audit_log (tenant_id, entity_type, entity_id, action, details, actor_user_id)
VALUES 
  (329, 'tenant', '197', 'merge_source', '{"merged_from": 197, "reason": "Duplicate RTO 91020"}', NULL),
  (197, 'tenant', '329', 'merge_target', '{"merged_into": 329, "reason": "Duplicate RTO 91020"}', NULL);