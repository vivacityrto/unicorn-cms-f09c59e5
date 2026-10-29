-- Let milestones link up through a Team Rock: an Individual milestone can support a milestone of the
-- Team Rock its Rock serves, and a Team milestone can support a milestone of the Company Rock its Team
-- Rock serves. An Individual milestone can still support a Company milestone directly or through a
-- Team Rock, exactly as before, so every link already stored stays valid.
--
-- Only the validation changes. The table keeps its column names (company_milestone_id is the milestone
-- being supported, individual_milestone_id is the one doing the supporting) so no reader or writer breaks.

CREATE OR REPLACE FUNCTION public.validate_eos_rock_milestone_link()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  upper_rock_id uuid;
  lower_rock_id uuid;
  upper_level text;
  lower_level text;
  lower_parent_id uuid;
  lower_grandparent_id uuid;
BEGIN
  SELECT rock_id INTO upper_rock_id
  FROM public.eos_rock_milestones
  WHERE id = NEW.company_milestone_id AND tenant_id = NEW.tenant_id;

  SELECT rock_id INTO lower_rock_id
  FROM public.eos_rock_milestones
  WHERE id = NEW.individual_milestone_id AND tenant_id = NEW.tenant_id;

  IF upper_rock_id IS NULL OR lower_rock_id IS NULL THEN
    RAISE EXCEPTION 'Both milestones must belong to the selected tenant';
  END IF;

  SELECT rock_level INTO upper_level
  FROM public.eos_rocks
  WHERE id = upper_rock_id AND tenant_id = NEW.tenant_id;

  SELECT rock_level, parent_rock_id INTO lower_level, lower_parent_id
  FROM public.eos_rocks
  WHERE id = lower_rock_id AND tenant_id = NEW.tenant_id;

  IF upper_level = 'company' AND lower_level = 'individual' THEN
    -- An Individual Rock serves a Company Rock directly, or through a Team Rock that serves it.
    SELECT parent_rock_id INTO lower_grandparent_id
    FROM public.eos_rocks
    WHERE id = lower_parent_id AND tenant_id = NEW.tenant_id AND rock_level = 'team';

    IF lower_parent_id IS DISTINCT FROM upper_rock_id
       AND lower_grandparent_id IS DISTINCT FROM upper_rock_id THEN
      RAISE EXCEPTION 'Individual milestone must belong to an Individual Rock under the linked Company Rock';
    END IF;
  ELSIF upper_level = 'team' AND lower_level = 'individual' THEN
    IF lower_parent_id IS DISTINCT FROM upper_rock_id THEN
      RAISE EXCEPTION 'Individual milestone must belong to an Individual Rock under the linked Team Rock';
    END IF;
  ELSIF upper_level = 'company' AND lower_level = 'team' THEN
    IF lower_parent_id IS DISTINCT FROM upper_rock_id THEN
      RAISE EXCEPTION 'Team milestone must belong to a Team Rock under the linked Company Rock';
    END IF;
  ELSE
    RAISE EXCEPTION 'A milestone can only support a milestone of the Rock it serves: Individual to Team or Company, Team to Company';
  END IF;

  RETURN NEW;
END;
$function$;

REVOKE ALL ON FUNCTION public.validate_eos_rock_milestone_link() FROM PUBLIC, anon;
