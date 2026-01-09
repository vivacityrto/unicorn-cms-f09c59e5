-- Add missing columns to tga_debug_payloads
ALTER TABLE public.tga_debug_payloads 
  ADD COLUMN IF NOT EXISTS tenant_id bigint REFERENCES tenants(id),
  ADD COLUMN IF NOT EXISTS rto_code text;