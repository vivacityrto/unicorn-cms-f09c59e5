-- Add selected_tenant_id column to audit_inspection table for storing the selected tenant from clients dropdown
ALTER TABLE public.audit_inspection 
ADD COLUMN selected_tenant_id bigint REFERENCES public.tenants(id) ON DELETE SET NULL;

-- Add index for better performance
CREATE INDEX idx_audit_inspection_selected_tenant_id ON public.audit_inspection(selected_tenant_id);