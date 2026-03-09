-- Safety-net trigger: auto-set primary_contact when role = 'parent'
CREATE OR REPLACE FUNCTION sync_primary_contact_on_role()
RETURNS trigger AS $$
BEGIN
  IF NEW.role = 'parent' AND (NEW.primary_contact IS NULL OR NEW.primary_contact = false) THEN
    NEW.primary_contact := true;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_sync_primary_contact
  BEFORE INSERT OR UPDATE ON public.tenant_users
  FOR EACH ROW EXECUTE FUNCTION sync_primary_contact_on_role();

-- Backfill existing parent rows missing the flag
UPDATE public.tenant_users
SET primary_contact = true
WHERE role = 'parent' AND (primary_contact IS NULL OR primary_contact = false);