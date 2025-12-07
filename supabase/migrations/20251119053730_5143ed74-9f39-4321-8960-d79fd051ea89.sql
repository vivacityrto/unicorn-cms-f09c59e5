-- Add metadata column and package_id to tenants table
ALTER TABLE public.tenants 
ADD COLUMN IF NOT EXISTS metadata jsonb DEFAULT '{}'::jsonb,
ADD COLUMN IF NOT EXISTS package_id bigint REFERENCES public.packages(id) ON DELETE SET NULL;