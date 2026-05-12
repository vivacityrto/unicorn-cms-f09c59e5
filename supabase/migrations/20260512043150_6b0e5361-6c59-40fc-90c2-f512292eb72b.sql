CREATE OR REPLACE FUNCTION public.sync_primary_contact_on_role()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.relationship_role = 'primary_contact' THEN
    NEW.primary_contact   := true;
    NEW.secondary_contact := false;
  ELSIF NEW.relationship_role = 'secondary_contact' THEN
    NEW.primary_contact   := false;
    NEW.secondary_contact := true;
  ELSIF NEW.relationship_role IN ('user','academy_user') THEN
    NEW.primary_contact   := false;
    NEW.secondary_contact := false;
  ELSE
    -- relationship_role IS NULL: Unicorn 1 importer backward compat.
    IF NEW.role = 'parent'
       AND COALESCE(NEW.primary_contact, false) = false THEN
      NEW.primary_contact := true;
    END IF;
    IF COALESCE(NEW.primary_contact, false)
       AND COALESCE(NEW.secondary_contact, false) THEN
      NEW.secondary_contact := false;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;