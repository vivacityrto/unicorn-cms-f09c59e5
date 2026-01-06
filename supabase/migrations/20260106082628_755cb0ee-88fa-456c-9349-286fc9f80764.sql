-- Make package_id nullable in audit log to allow stage-level logging
ALTER TABLE public.package_builder_audit_log ALTER COLUMN package_id DROP NOT NULL;