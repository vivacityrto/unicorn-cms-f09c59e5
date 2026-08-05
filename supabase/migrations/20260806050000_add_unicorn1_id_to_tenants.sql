-- Unicorn 1 redirect links (TenantTimeTrackerBar, CompliancePulseBanner) currently
-- build https://unicorn-cms.com.au/clients/{tenants.id} directly. That only works
-- for tenants imported 1:1 from Unicorn 1 (import-unicorn1-client sets tenants.id =
-- the real Unicorn 1 client_id). Tenants created organically in Unicorn 2 get a
-- fresh tenants.id that doesn't correspond to any Unicorn 1 record, and Unicorn 1's
-- own auto-increment sequence has drifted 1 ahead of where it used to line up.
--
-- unicorn1_id is a manual override: the redirect uses unicorn1_id when set, else
-- falls back to tenants.id (unchanged behavior for already-imported tenants).

ALTER TABLE public.tenants
  ADD COLUMN IF NOT EXISTS unicorn1_id bigint;

COMMENT ON COLUMN public.tenants.unicorn1_id IS
  'Manual override for the Unicorn 1 client id used in Unicorn 1 redirect links. Null falls back to tenants.id.';

-- Organic tenant creation (AddTenantDialog) defaults unicorn1_id to id + 1, correcting
-- for the known 1-off drift. import-unicorn1-client explicitly sets unicorn1_id to the
-- real client_id on insert, so this default only fires when it wasn't already supplied.
CREATE OR REPLACE FUNCTION public.set_default_unicorn1_id()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  IF NEW.unicorn1_id IS NULL THEN
    NEW.unicorn1_id := NEW.id + 1;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_set_default_unicorn1_id ON public.tenants;
CREATE TRIGGER trg_set_default_unicorn1_id
  BEFORE INSERT ON public.tenants
  FOR EACH ROW
  EXECUTE FUNCTION public.set_default_unicorn1_id();
