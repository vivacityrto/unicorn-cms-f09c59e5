
-- ============================================================
-- Security Fix: Add search_path to functions missing it
-- Issue: SUPA_function_search_path_mutable
-- ============================================================

-- 1. Fix enforce_level10_participants trigger function
CREATE OR REPLACE FUNCTION public.enforce_level10_participants()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $function$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM public.eos_meetings m
    WHERE m.id = NEW.meeting_id
      AND m.meeting_type::text ILIKE '%level%'
  ) THEN
    IF NOT EXISTS (
      SELECT 1
      FROM public.users u
      WHERE u.user_uuid = NEW.user_id
        AND u.unicorn_role IN ('Super Admin', 'Team Leader', 'Team Member')
        AND u.archived IS DISTINCT FROM true
    ) THEN
      RAISE EXCEPTION 'User is not Vivacity Team, cannot be added to Level 10 meeting';
    END IF;
  END IF;

  RETURN NEW;
END;
$function$;

-- 2. Fix update_document_links_updated_at trigger function
CREATE OR REPLACE FUNCTION public.update_document_links_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $function$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$function$;

-- Add documentation comments
COMMENT ON FUNCTION public.enforce_level10_participants() IS 
'Trigger function that enforces only Vivacity Team members can be added to Level 10 meetings.';

COMMENT ON FUNCTION public.update_document_links_updated_at() IS 
'Trigger function that automatically updates the updated_at timestamp on document_links.';
