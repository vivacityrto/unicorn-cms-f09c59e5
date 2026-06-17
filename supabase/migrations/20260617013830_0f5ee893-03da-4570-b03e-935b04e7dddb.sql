CREATE OR REPLACE FUNCTION public.client_action_items_portal_column_guard()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_uid uuid := auth.uid();
BEGIN
  IF current_setting('request.jwt.claim.role', true) = 'service_role'
     OR public.is_vivacity_team_safe(v_uid) THEN
    RETURN NEW;
  END IF;

  IF NEW.tenant_id           IS DISTINCT FROM OLD.tenant_id
  OR NEW.client_id           IS DISTINCT FROM OLD.client_id
  OR NEW.created_at          IS DISTINCT FROM OLD.created_at
  OR NEW.created_by          IS DISTINCT FROM OLD.created_by
  OR NEW.title               IS DISTINCT FROM OLD.title
  OR NEW.description         IS DISTINCT FROM OLD.description
  OR NEW.owner_user_id       IS DISTINCT FROM OLD.owner_user_id
  OR NEW.due_date            IS DISTINCT FROM OLD.due_date
  OR NEW.source              IS DISTINCT FROM OLD.source
  OR NEW.source_note_id      IS DISTINCT FROM OLD.source_note_id
  OR NEW.related_entity_type IS DISTINCT FROM OLD.related_entity_type
  OR NEW.related_entity_id   IS DISTINCT FROM OLD.related_entity_id
  OR NEW.recurrence_rule     IS DISTINCT FROM OLD.recurrence_rule
  OR NEW.item_type           IS DISTINCT FROM OLD.item_type
  OR NEW.package_id          IS DISTINCT FROM OLD.package_id
  OR NEW.stage_id            IS DISTINCT FROM OLD.stage_id
  OR NEW.sort_order          IS DISTINCT FROM OLD.sort_order
  THEN
    RAISE EXCEPTION
      'Portal users may only update status, completed_at, completed_by, assignee_user_id, priority on client_action_items'
      USING ERRCODE = '42501';
  END IF;

  RETURN NEW;
END;
$function$;