-- stage_releases
DROP POLICY IF EXISTS stage_releases_admin_select ON public.stage_releases;
CREATE POLICY stage_releases_admin_select ON public.stage_releases
FOR SELECT USING (
  EXISTS (
    SELECT 1 FROM public.users u
    WHERE u.user_uuid = (SELECT auth.uid())
      AND (
        u.unicorn_role = 'Super Admin'
        OR (u.unicorn_role = 'Admin' AND u.tenant_id = stage_releases.tenant_id)
      )
  )
);

DROP POLICY IF EXISTS stage_releases_admin_insert ON public.stage_releases;
CREATE POLICY stage_releases_admin_insert ON public.stage_releases
FOR INSERT WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.users u
    WHERE u.user_uuid = (SELECT auth.uid())
      AND (
        u.unicorn_role = 'Super Admin'
        OR (u.unicorn_role = 'Admin' AND u.tenant_id = stage_releases.tenant_id)
      )
  )
);

DROP POLICY IF EXISTS stage_releases_admin_update ON public.stage_releases;
CREATE POLICY stage_releases_admin_update ON public.stage_releases
FOR UPDATE USING (
  EXISTS (
    SELECT 1 FROM public.users u
    WHERE u.user_uuid = (SELECT auth.uid())
      AND (
        u.unicorn_role = 'Super Admin'
        OR (u.unicorn_role = 'Admin' AND u.tenant_id = stage_releases.tenant_id)
      )
  )
);

-- stage_release_items
DROP POLICY IF EXISTS stage_release_items_admin_select ON public.stage_release_items;
CREATE POLICY stage_release_items_admin_select ON public.stage_release_items
FOR SELECT USING (
  EXISTS (
    SELECT 1
    FROM public.users u
    JOIN public.stage_releases sr ON sr.id = stage_release_items.stage_release_id
    WHERE u.user_uuid = (SELECT auth.uid())
      AND (
        u.unicorn_role = 'Super Admin'
        OR (u.unicorn_role = 'Admin' AND u.tenant_id = sr.tenant_id)
      )
  )
);

-- stage_release_reviews
DROP POLICY IF EXISTS stage_release_reviews_admin_insert ON public.stage_release_reviews;
CREATE POLICY stage_release_reviews_admin_insert ON public.stage_release_reviews
FOR INSERT WITH CHECK (
  EXISTS (
    SELECT 1
    FROM public.users u
    JOIN public.stage_releases sr ON sr.id = stage_release_reviews.stage_release_id
    WHERE u.user_uuid = (SELECT auth.uid())
      AND (
        u.unicorn_role = 'Super Admin'
        OR (u.unicorn_role = 'Admin' AND u.tenant_id = sr.tenant_id)
      )
  )
);

DROP POLICY IF EXISTS stage_release_reviews_reviewer_select ON public.stage_release_reviews;
CREATE POLICY stage_release_reviews_reviewer_select ON public.stage_release_reviews
FOR SELECT USING (
  reviewer_user_id = (SELECT auth.uid())
  OR EXISTS (
    SELECT 1
    FROM public.users u
    JOIN public.stage_releases sr ON sr.id = stage_release_reviews.stage_release_id
    WHERE u.user_uuid = (SELECT auth.uid())
      AND (
        u.unicorn_role = 'Super Admin'
        OR (u.unicorn_role = 'Admin' AND u.tenant_id = sr.tenant_id)
      )
  )
);

DROP POLICY IF EXISTS stage_release_reviews_reviewer_update ON public.stage_release_reviews;
CREATE POLICY stage_release_reviews_reviewer_update ON public.stage_release_reviews
FOR UPDATE USING (
  reviewer_user_id = (SELECT auth.uid())
  OR EXISTS (
    SELECT 1
    FROM public.users u
    JOIN public.stage_releases sr ON sr.id = stage_release_reviews.stage_release_id
    WHERE u.user_uuid = (SELECT auth.uid())
      AND (
        u.unicorn_role = 'Super Admin'
        OR (u.unicorn_role = 'Admin' AND u.tenant_id = sr.tenant_id)
      )
  )
);

-- compliance_pack_exports
DROP POLICY IF EXISTS compliance_pack_exports_admin_select ON public.compliance_pack_exports;
CREATE POLICY compliance_pack_exports_admin_select ON public.compliance_pack_exports
FOR SELECT USING (
  EXISTS (
    SELECT 1 FROM public.users u
    WHERE u.user_uuid = (SELECT auth.uid())
      AND (
        u.unicorn_role = 'Super Admin'
        OR (u.unicorn_role = 'Admin' AND u.tenant_id = compliance_pack_exports.tenant_id)
      )
  )
);

DROP POLICY IF EXISTS compliance_pack_exports_admin_insert ON public.compliance_pack_exports;
CREATE POLICY compliance_pack_exports_admin_insert ON public.compliance_pack_exports
FOR INSERT WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.users u
    WHERE u.user_uuid = (SELECT auth.uid())
      AND (
        u.unicorn_role = 'Super Admin'
        OR (u.unicorn_role = 'Admin' AND u.tenant_id = compliance_pack_exports.tenant_id)
      )
  )
);