-- Finalise the old package instance 15066 that was superseded by renewal 15152
UPDATE package_instances
SET is_complete = true,
    is_active = false,
    membership_state = 'complete',
    end_date = '2025-11-24'
WHERE id = 15066
  AND tenant_id = 7449
  AND is_complete = false;

-- Log the state change for audit
INSERT INTO package_instance_state_log (package_instance_id, old_state, new_state, changed_by, reason)
VALUES (15066, 'active', 'complete', '551f13b0-51a4-4e47-9e62-64a386e2f4c4', 'Retroactive finalisation — superseded by renewal instance 15152');