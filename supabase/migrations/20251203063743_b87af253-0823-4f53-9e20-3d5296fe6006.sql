-- Add package_id column to tenant_notes table to support package-specific notes
ALTER TABLE public.tenant_notes 
ADD COLUMN package_id bigint REFERENCES public.packages(id) ON DELETE SET NULL;

-- Create index for faster lookups
CREATE INDEX idx_tenant_notes_package_id ON public.tenant_notes(package_id);

-- Add comment for documentation
COMMENT ON COLUMN public.tenant_notes.package_id IS 'Optional package association for package-specific notes';