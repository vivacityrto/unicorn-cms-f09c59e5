ALTER TABLE time_entries
  ADD COLUMN package_instance_id bigint
  REFERENCES package_instances(id);