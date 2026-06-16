-- =====================================================================
-- Migration: rls_split_client_action_items_and_comments  (3 of 5)
-- Window:    RECOMMENDED 22:00–04:00 AEST
-- Pre-deploy verification (run manually):
--   SELECT polname, polcmd,
--          pg_get_expr(polqual, polrelid) AS using_expr,
--          pg_get_expr(polwithcheck, polrelid) AS check_expr
--     FROM pg_policy
--    WHERE polrelid IN ('public.client_action_items'::regclass,
--                       'public.client_action_item_comments'::regclass);
--   SELECT count(*) FROM public.client_action_items;
--   SELECT count(*) FROM public.client_action_item_comments;
-- =====================================================================

-- 3a. Column-guard trigger function
CREATE OR REPLACE FUNCTION public.client_action_items_portal_column_guard()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
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
  OR NEW.priority            IS DISTINCT FROM OLD.priority
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
      'Portal users may only update status, completed_at, completed_by, assignee_user_id on client_action_items'
      USING ERRCODE = '42501';
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.client_action_items_portal_column_guard() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.client_action_items_portal_column_guard() TO authenticated, service_role;

DROP TRIGGER IF EXISTS trg_cai_portal_column_guard ON public.client_action_items;
CREATE TRIGGER trg_cai_portal_column_guard
  BEFORE UPDATE ON public.client_action_items
  FOR EACH ROW EXECUTE FUNCTION public.client_action_items_portal_column_guard();

-- 3b. Replace client_action_items policies
DROP POLICY IF EXISTS client_action_items_tenant_select ON public.client_action_items;
DROP POLICY IF EXISTS client_action_items_tenant_insert ON public.client_action_items;
DROP POLICY IF EXISTS client_action_items_tenant_update ON public.client_action_items;
DROP POLICY IF EXISTS client_action_items_tenant_delete ON public.client_action_items;

CREATE POLICY cai_staff_all
  ON public.client_action_items
  FOR ALL TO authenticated
  USING      (public.is_vivacity_team_safe(auth.uid()))
  WITH CHECK (public.is_vivacity_team_safe(auth.uid()));

CREATE POLICY cai_portal_select
  ON public.client_action_items
  FOR SELECT TO authenticated
  USING (
    item_type = 'client'
    AND NOT public.is_vivacity_team_safe(auth.uid())
    AND EXISTS (
      SELECT 1 FROM public.users u
       WHERE u.user_uuid = auth.uid()
         AND u.tenant_id = client_action_items.tenant_id
    )
  );

CREATE POLICY cai_portal_update
  ON public.client_action_items
  FOR UPDATE TO authenticated
  USING (
    item_type = 'client'
    AND NOT public.is_vivacity_team_safe(auth.uid())
    AND EXISTS (
      SELECT 1 FROM public.users u
       WHERE u.user_uuid = auth.uid()
         AND u.tenant_id = client_action_items.tenant_id
    )
  )
  WITH CHECK (
    item_type = 'client'
    AND NOT public.is_vivacity_team_safe(auth.uid())
    AND EXISTS (
      SELECT 1 FROM public.users u
       WHERE u.user_uuid = auth.uid()
         AND u.tenant_id = client_action_items.tenant_id
    )
  );

REVOKE ALL ON public.client_action_items FROM anon;

-- 3c. Replace client_action_item_comments policies
-- NOTE: actual live policy is 'client_action_item_comments_tenant_all'.
-- Both names dropped defensively in case staging/prod differ.
DROP POLICY IF EXISTS client_action_item_comments_tenant_all ON public.client_action_item_comments;
DROP POLICY IF EXISTS "Comments tenant isolation"           ON public.client_action_item_comments;

CREATE POLICY caic_staff_all
  ON public.client_action_item_comments
  FOR ALL TO authenticated
  USING      (public.is_vivacity_team_safe(auth.uid()))
  WITH CHECK (public.is_vivacity_team_safe(auth.uid()));

CREATE POLICY caic_portal_select
  ON public.client_action_item_comments
  FOR SELECT TO authenticated
  USING (
    NOT public.is_vivacity_team_safe(auth.uid())
    AND EXISTS (
      SELECT 1 FROM public.client_action_items cai
       WHERE cai.id = client_action_item_comments.action_item_id
         AND cai.item_type = 'client'
         AND EXISTS (
           SELECT 1 FROM public.users u
            WHERE u.user_uuid = auth.uid()
              AND u.tenant_id = cai.tenant_id
         )
    )
  );

CREATE POLICY caic_portal_insert
  ON public.client_action_item_comments
  FOR INSERT TO authenticated
  WITH CHECK (
    NOT public.is_vivacity_team_safe(auth.uid())
    AND created_by = auth.uid()
    AND EXISTS (
      SELECT 1 FROM public.client_action_items cai
       WHERE cai.id = client_action_item_comments.action_item_id
         AND cai.item_type = 'client'
         AND cai.tenant_id = client_action_item_comments.tenant_id
         AND EXISTS (
           SELECT 1 FROM public.users u
            WHERE u.user_uuid = auth.uid()
              AND u.tenant_id = cai.tenant_id
         )
    )
  );

REVOKE ALL ON public.client_action_item_comments FROM anon;

-- =====================================================================
-- Post-deploy verification:
--   SELECT polname, polcmd FROM pg_policy
--    WHERE polrelid IN ('public.client_action_items'::regclass,
--                       'public.client_action_item_comments'::regclass)
--    ORDER BY polrelid, polname;
--   -- Expect CAI:  cai_staff_all, cai_portal_select, cai_portal_update
--   -- Expect CAIC: caic_staff_all, caic_portal_select, caic_portal_insert
--   SELECT tgname FROM pg_trigger
--    WHERE tgrelid='public.client_action_items'::regclass AND NOT tgisinternal;
--   SELECT privilege_type FROM information_schema.role_table_grants
--    WHERE grantee='anon' AND table_schema='public'
--      AND table_name IN ('client_action_items','client_action_item_comments');
--   -- Expect 0 rows
-- =====================================================================