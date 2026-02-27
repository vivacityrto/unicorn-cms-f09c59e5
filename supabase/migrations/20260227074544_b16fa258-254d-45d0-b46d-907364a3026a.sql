
-- Add is_recurring to documents_stages (stage registry - sets the default)
ALTER TABLE public.documents_stages
ADD COLUMN is_recurring boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.documents_stages.is_recurring IS 'Whether tasks in this stage should reset on package renewal';

-- Add is_recurring to package_stages (inherits default from stage registry)
ALTER TABLE public.package_stages
ADD COLUMN is_recurring boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.package_stages.is_recurring IS 'Whether this stage resets on renewal. Defaults from documents_stages.is_recurring';

-- Add is_recurring to stage_instances (inherits default from package_stages)
ALTER TABLE public.stage_instances
ADD COLUMN is_recurring boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.stage_instances.is_recurring IS 'Whether this stage instance resets on renewal. Set from package_stages.is_recurring at creation';
