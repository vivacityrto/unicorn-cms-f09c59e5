-- Rollback for 20261030010000_rock_milestone_links_team_chain.sql.
-- Restores the original validation (the supported milestone must be a Company Rock's, supported by an
-- Individual Rock under it, directly or through a Team Rock).
-- Destructive: first deletes every link with a Team Rock milestone at either end, because the restored
-- rule would refuse them if they were ever re-saved. Links between Individual and Company milestones
-- are not touched.

DELETE FROM public.eos_rock_milestone_links l
USING public.eos_rock_milestones m, public.eos_rocks r
WHERE r.id = m.rock_id
  AND r.rock_level = 'team'
  AND m.id IN (l.company_milestone_id, l.individual_milestone_id);

CREATE OR REPLACE FUNCTION public.validate_eos_rock_milestone_link()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  company_rock_id uuid;
  individual_rock_id uuid;
  individual_parent_id uuid;
  individual_grandparent_id uuid;
BEGIN
  SELECT rock_id INTO company_rock_id
  FROM public.eos_rock_milestones
  WHERE id = NEW.company_milestone_id AND tenant_id = NEW.tenant_id;

  SELECT rock_id INTO individual_rock_id
  FROM public.eos_rock_milestones
  WHERE id = NEW.individual_milestone_id AND tenant_id = NEW.tenant_id;

  IF company_rock_id IS NULL OR individual_rock_id IS NULL THEN
    RAISE EXCEPTION 'Both milestones must belong to the selected tenant';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.eos_rocks
    WHERE id = company_rock_id AND tenant_id = NEW.tenant_id AND rock_level = 'company'
  ) THEN
    RAISE EXCEPTION 'Company milestone must belong to a Company Rock';
  END IF;

  SELECT parent_rock_id INTO individual_parent_id
  FROM public.eos_rocks
  WHERE id = individual_rock_id AND tenant_id = NEW.tenant_id AND rock_level = 'individual';

  SELECT parent_rock_id INTO individual_grandparent_id
  FROM public.eos_rocks
  WHERE id = individual_parent_id AND tenant_id = NEW.tenant_id AND rock_level = 'team';

  IF individual_parent_id IS DISTINCT FROM company_rock_id
     AND individual_grandparent_id IS DISTINCT FROM company_rock_id THEN
    RAISE EXCEPTION 'Individual milestone must belong to an Individual Rock under the linked Company Rock';
  END IF;

  RETURN NEW;
END;
$function$;

REVOKE ALL ON FUNCTION public.validate_eos_rock_milestone_link() FROM PUBLIC, anon;
