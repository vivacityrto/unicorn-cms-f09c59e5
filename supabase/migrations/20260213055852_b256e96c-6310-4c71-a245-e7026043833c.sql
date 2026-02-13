-- Change eos_rocks.client_id from referencing clients_legacy (UUID) to referencing tenants (integer)
-- A dependent RLS policy references client_id, so we must drop/recreate it

-- Step 1: Drop dependent RLS policy
DROP POLICY IF EXISTS client_viewers_select_rocks ON public.eos_rocks;

-- Step 2: Drop existing FK constraint
ALTER TABLE public.eos_rocks DROP CONSTRAINT IF EXISTS eos_rocks_client_id_fkey;

-- Step 3: Clear existing data and drop/recreate column
UPDATE public.eos_rocks SET client_id = NULL WHERE client_id IS NOT NULL;
ALTER TABLE public.eos_rocks DROP COLUMN client_id;
ALTER TABLE public.eos_rocks ADD COLUMN client_id integer REFERENCES public.tenants(id);

-- Step 4: Recreate RLS policy for client viewers using new integer column
CREATE POLICY "client_viewers_select_rocks"
  ON public.eos_rocks
  FOR SELECT
  TO authenticated
  USING (
    public.has_tenant_access_safe(client_id, auth.uid())
  );

-- Step 5: Add index for performance
CREATE INDEX IF NOT EXISTS idx_eos_rocks_client_id ON public.eos_rocks(client_id);