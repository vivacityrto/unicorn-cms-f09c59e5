-- Fix: Add missing FK constraint between users and tenants
-- This enables Supabase join syntax: tenants!tenant_id(name)

-- Step 1: Clean orphaned tenant references (Dave Richards, tenant_id=216)
UPDATE public.users
SET tenant_id = NULL, updated_at = now()
WHERE tenant_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM public.tenants WHERE id = users.tenant_id
  );

-- Step 2: Add the foreign key constraint
ALTER TABLE public.users
  ADD CONSTRAINT users_tenant_id_fkey
  FOREIGN KEY (tenant_id)
  REFERENCES public.tenants(id)
  ON DELETE SET NULL;