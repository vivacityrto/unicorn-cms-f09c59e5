-- Alter stage_instances to use bigint for consistency with other tables
ALTER TABLE public.stage_instances 
  ALTER COLUMN id TYPE bigint,
  ALTER COLUMN package_instance_id TYPE bigint;