-- Strip client_id from drop_rock_to_issue INSERT.
-- Bug: 14 May 2026 rename rebound v_rock.client_id -> v_rock.client_tenant_id
-- (integer) but eos_issues.client_id is uuid -> "invalid input syntax for type uuid"
-- on any client-tagged rock. Dormant on untagged rocks because the frontend
-- short-circuits the client_id key when rock.client_tenant_id is null.
-- Strip strategy: eos_issues.client_id legacy uuid->clients_legacy has no working
-- write path post-rename; leave NULL until Scope B migration. tenant_id still
-- inherits from rock, RLS unaffected.
--
-- ROLLBACK (copy-paste):
-- CREATE OR REPLACE FUNCTION public.drop_rock_to_issue(p_rock_id uuid)
--  RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
-- AS $function$
-- DECLARE v_rock RECORD; v_issue_id UUID;
-- BEGIN
--   SELECT * INTO v_rock FROM public.eos_rocks WHERE id = p_rock_id;
--   IF NOT FOUND THEN RAISE EXCEPTION 'Rock not found'; END IF;
--   INSERT INTO public.eos_issues (
--     tenant_id, client_id, title, description, priority, assigned_to, created_by, status
--   ) VALUES (
--     v_rock.tenant_id, v_rock.client_tenant_id, v_rock.title,
--     COALESCE(v_rock.description, '') || ' (from Rock)', v_rock.priority,
--     v_rock.owner_id, auth.uid(), 'Open'
--   ) RETURNING id INTO v_issue_id;
--   RETURN v_issue_id;
-- END;
-- $function$;

CREATE OR REPLACE FUNCTION public.drop_rock_to_issue(p_rock_id uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_rock RECORD;
  v_issue_id UUID;
BEGIN
  SELECT * INTO v_rock FROM public.eos_rocks WHERE id = p_rock_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Rock not found'; END IF;

  INSERT INTO public.eos_issues (
    tenant_id, title, description, priority, assigned_to, created_by, status
  ) VALUES (
    v_rock.tenant_id, v_rock.title,
    COALESCE(v_rock.description, '') || ' (from Rock)', v_rock.priority,
    v_rock.owner_id, auth.uid(), 'Open'
  ) RETURNING id INTO v_issue_id;

  RETURN v_issue_id;
END;
$function$;