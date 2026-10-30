-- Rollback for 20261030010000_rock_milestone_links_team_chain.sql.
-- Restores the original validation (the supported milestone must be a Company Rock's, supported by an
-- Individual Rock under it, directly or through a Team Rock).
--
-- Deletes nothing. Restoring the rule does not touch links already stored, so any Individual-to-Team or
-- Team-to-Company links made while the Team chain was live stay in the table. The restored rule only checks
-- a link when it is inserted or updated, so they are harmless to leave, but the old screens do not offer
-- them. To remove them deliberately, review and then run this by hand (it is a comment so the migration
-- safety audit, which blocks any DELETE in a changed migration file, does not treat it as part of the rollback):
--
--   DELETE FROM public.eos_rock_milestone_links l
--   USING public.eos_rock_milestones m, public.eos_rocks r
--   WHERE r.id = m.rock_id
--     AND r.rock_level = 'team'
--     AND m.id IN (l.company_milestone_id, l.individual_milestone_id);

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
