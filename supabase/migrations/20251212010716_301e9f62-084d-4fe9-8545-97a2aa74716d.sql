-- Add template_id column to audit table to link inspections to templates
ALTER TABLE public.audit 
ADD COLUMN template_id bigint REFERENCES public.audit_templates(id);

-- Create index for performance
CREATE INDEX idx_audit_template_id ON public.audit(template_id);