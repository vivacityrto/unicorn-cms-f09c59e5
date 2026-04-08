DELETE FROM package_instance_state_log WHERE package_instance_id IN (SELECT id FROM package_instances WHERE tenant_id = 7543);
DELETE FROM package_instances WHERE tenant_id = 7543;