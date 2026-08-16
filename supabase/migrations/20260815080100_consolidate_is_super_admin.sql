-- Consolidate public.is_super_admin to a single no-arg overload with
-- search_path = '' (was two overloads, both search_path = public).
--
-- Pre-check (live, 2026-08-15):
--   is_super_admin()            — used by many RLS policies. KEEP.
--   is_super_admin(uuid)        — 13 RLS policies plus two function
--                                 bodies (has_permission,
--                                 search_knowledge_items) call
--                                 is_super_admin(auth.uid()). Those
--                                 callers are retargeted before the
--                                 uuid signature is dropped.
--
-- Behaviour note: is_super_admin(uuid) previously checked only
-- unicorn_role = 'Super Admin' AND not archived. is_super_admin() /
-- is_super_admin_safe also require is_vivacity_internal and accept
-- global_role = 'SuperAdmin'. That is a deliberate alignment with
-- the no-arg overload / check_permission, not a silent widening.
--
-- DROP FUNCTION first: CREATE OR REPLACE cannot change a signature, and
-- leaving the uuid overload would keep the split the advisor flagged.

CREATE OR REPLACE FUNCTION public.has_permission(
  p_feature_key text,
  p_min_level text DEFAULT 'limited'::text
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $function$
  SELECT
    public.is_super_admin_safe(auth.uid())
    OR EXISTS (
      SELECT 1
      FROM public.role_permissions rp
      WHERE rp.feature_key = p_feature_key
        AND (CASE rp.level WHEN 'full' THEN 3 WHEN 'limited' THEN 2 WHEN 'owner_only' THEN 1 ELSE 0 END)
            >= (CASE p_min_level WHEN 'full' THEN 3 WHEN 'limited' THEN 2 WHEN 'owner_only' THEN 1 ELSE 0 END)
        AND rp.role IN (
          SELECT unicorn_role FROM public.users WHERE user_uuid = auth.uid() AND unicorn_role IS NOT NULL
          UNION
          SELECT role FROM public.user_roles WHERE user_uuid = auth.uid()
        )
    );
$function$;

CREATE OR REPLACE FUNCTION public.search_knowledge_items(
  p_search_query text,
  p_source_types text[] DEFAULT NULL::text[],
  p_limit integer DEFAULT 10
)
RETURNS TABLE(id uuid, source_type text, title text, content text, version text, tags text[], rank real)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
BEGIN
  IF NOT public.is_super_admin_safe(auth.uid()) THEN
    RAISE EXCEPTION 'Access denied: SuperAdmin only';
  END IF;

  RETURN QUERY
  SELECT
    ki.id,
    ki.source_type,
    ki.title,
    ki.content,
    ki.version,
    ki.tags,
    ts_rank(to_tsvector('english', ki.title || ' ' || ki.content), plainto_tsquery('english', p_search_query)) as rank
  FROM public.knowledge_items ki
  WHERE
    ki.approval_status = 'approved'
    AND (p_source_types IS NULL OR ki.source_type = ANY(p_source_types))
    AND NOT (ki.source_type = 'regulatory_mapping' AND ki.regulatory_standard = 'Standards for RTOs 2015')
    AND to_tsvector('english', ki.title || ' ' || ki.content) @@ plainto_tsquery('english', p_search_query)
  ORDER BY rank DESC
  LIMIT p_limit;
END;
$function$;

-- 13 RLS policies called is_super_admin(auth.uid()). Retarget them at the
-- no-arg overload before the uuid signature is dropped.
ALTER POLICY assistant_audit_log_superadmin_own ON public.assistant_audit_log
  USING ((viewer_user_id = (SELECT auth.uid())) AND public.is_super_admin())
  WITH CHECK ((viewer_user_id = (SELECT auth.uid())) AND public.is_super_admin());

ALTER POLICY eos_process_audit_log_superadmin_all ON public.eos_process_audit_log
  USING (public.is_super_admin())
  WITH CHECK (public.is_super_admin());

ALTER POLICY eos_process_versions_superadmin_all ON public.eos_process_versions
  USING (public.is_super_admin())
  WITH CHECK (public.is_super_admin());

ALTER POLICY eos_processes_superadmin_all ON public.eos_processes
  USING (public.is_super_admin())
  WITH CHECK (public.is_super_admin());

ALTER POLICY eos_qc_answers_superadmin_all ON public.eos_qc_answers
  USING (public.is_super_admin())
  WITH CHECK (public.is_super_admin());

ALTER POLICY eos_qc_fit_superadmin_all ON public.eos_qc_fit
  USING (public.is_super_admin())
  WITH CHECK (public.is_super_admin());

ALTER POLICY eos_qc_links_superadmin_all ON public.eos_qc_links
  USING (public.is_super_admin())
  WITH CHECK (public.is_super_admin());

ALTER POLICY eos_qc_signoffs_superadmin_all ON public.eos_qc_signoffs
  USING (public.is_super_admin())
  WITH CHECK (public.is_super_admin());

ALTER POLICY eos_vto_superadmin_all ON public.eos_vto
  USING (public.is_super_admin())
  WITH CHECK (public.is_super_admin());

ALTER POLICY knowledge_item_audit_log_superadmin_all ON public.knowledge_item_audit_log
  USING (public.is_super_admin())
  WITH CHECK (public.is_super_admin());

ALTER POLICY knowledge_item_versions_superadmin_all ON public.knowledge_item_versions
  USING (public.is_super_admin())
  WITH CHECK (public.is_super_admin());

ALTER POLICY knowledge_items_superadmin_manage ON public.knowledge_items
  USING (public.is_super_admin())
  WITH CHECK (public.is_super_admin());

ALTER POLICY knowledge_items_superadmin_read_approved ON public.knowledge_items
  USING (public.is_super_admin() AND approval_status = 'approved');

DROP FUNCTION IF EXISTS public.is_super_admin(uuid);

CREATE OR REPLACE FUNCTION public.is_super_admin()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $function$
  SELECT public.is_super_admin_safe(auth.uid());
$function$;

REVOKE ALL ON FUNCTION public.is_super_admin() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_super_admin() TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.has_permission(text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.has_permission(text, text) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.search_knowledge_items(text, text[], integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.search_knowledge_items(text, text[], integer) TO authenticated, service_role;
