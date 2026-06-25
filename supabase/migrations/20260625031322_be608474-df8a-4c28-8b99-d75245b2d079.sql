
-- 1. Academy: restrict published-content read to authenticated enrolled users (staff have separate manage policy)
DROP POLICY IF EXISTS "Academy courses: anyone can view published" ON public.academy_courses;
CREATE POLICY "Academy courses: enrolled or staff view published"
ON public.academy_courses
FOR SELECT TO authenticated
USING (
  status = 'published'
  AND (
    public.is_vivacity_team_safe(auth.uid())
    OR EXISTS (
      SELECT 1 FROM public.academy_enrollments e
      WHERE e.course_id = academy_courses.id AND e.user_id = auth.uid()
    )
  )
);

DROP POLICY IF EXISTS "Academy modules: view published" ON public.academy_modules;
CREATE POLICY "Academy modules: enrolled or staff view published"
ON public.academy_modules
FOR SELECT TO authenticated
USING (
  is_published = true
  AND (
    public.is_vivacity_team_safe(auth.uid())
    OR EXISTS (
      SELECT 1 FROM public.academy_enrollments e
      WHERE e.course_id = academy_modules.course_id AND e.user_id = auth.uid()
    )
  )
);

DROP POLICY IF EXISTS "Academy lessons: view published" ON public.academy_lessons;
CREATE POLICY "Academy lessons: enrolled or staff view published"
ON public.academy_lessons
FOR SELECT TO authenticated
USING (
  is_published = true
  AND (
    public.is_vivacity_team_safe(auth.uid())
    OR EXISTS (
      SELECT 1
      FROM public.academy_modules m
      JOIN public.academy_enrollments e ON e.course_id = m.course_id
      WHERE m.id = academy_lessons.module_id AND e.user_id = auth.uid()
    )
  )
);

DROP POLICY IF EXISTS "Assessments: enrolled users view" ON public.academy_assessments;
CREATE POLICY "Assessments: enrolled or staff view"
ON public.academy_assessments
FOR SELECT TO authenticated
USING (
  is_published = true
  AND (
    public.is_vivacity_team_safe(auth.uid())
    OR EXISTS (
      SELECT 1 FROM public.academy_enrollments e
      WHERE e.course_id = academy_assessments.course_id AND e.user_id = auth.uid()
    )
  )
);

-- 2. email-files bucket: restrict reads to Vivacity staff OR users with tenant access to the parent email_message
DROP POLICY IF EXISTS "Authenticated users can view email files" ON storage.objects;
CREATE POLICY "Email files: tenant-scoped or staff read"
ON storage.objects
FOR SELECT TO authenticated
USING (
  bucket_id = 'email-files'
  AND (
    public.is_vivacity_team_safe(auth.uid())
    OR EXISTS (
      SELECT 1
      FROM public.email_message_attachments a
      JOIN public.email_messages m ON m.id = a.email_message_id
      WHERE a.storage_path = storage.objects.name
        AND public.has_tenant_access_safe(m.tenant_id, auth.uid())
    )
  )
);

-- 3. internal-onboarding bucket: restrict all operations to Vivacity internal staff
DROP POLICY IF EXISTS "Internal onboarding workbook files read" ON storage.objects;
DROP POLICY IF EXISTS "Internal onboarding workbook files upload" ON storage.objects;
DROP POLICY IF EXISTS "Internal onboarding workbook files update" ON storage.objects;
DROP POLICY IF EXISTS "Internal onboarding workbook files delete" ON storage.objects;

CREATE POLICY "Internal onboarding workbook files read"
ON storage.objects FOR SELECT TO authenticated
USING (bucket_id = 'internal-onboarding' AND public.is_vivacity_team_safe(auth.uid()));

CREATE POLICY "Internal onboarding workbook files upload"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'internal-onboarding' AND public.is_vivacity_team_safe(auth.uid()));

CREATE POLICY "Internal onboarding workbook files update"
ON storage.objects FOR UPDATE TO authenticated
USING (bucket_id = 'internal-onboarding' AND public.is_vivacity_team_safe(auth.uid()))
WITH CHECK (bucket_id = 'internal-onboarding' AND public.is_vivacity_team_safe(auth.uid()));

CREATE POLICY "Internal onboarding workbook files delete"
ON storage.objects FOR DELETE TO authenticated
USING (bucket_id = 'internal-onboarding' AND public.is_vivacity_team_safe(auth.uid()));

-- 4. Pin search_path on the 4 mutable functions
ALTER FUNCTION public.log_stage_health_change() SET search_path = '';
ALTER FUNCTION public.log_workload_snapshot() SET search_path = '';
ALTER FUNCTION public.set_user_type_from_role() SET search_path = '';
ALTER FUNCTION public.sync_is_vivacity_internal() SET search_path = '';

-- Functions reference unqualified public objects; rewrite with fully qualified names now that search_path is empty
CREATE OR REPLACE FUNCTION public.log_stage_health_change()
RETURNS trigger LANGUAGE plpgsql SET search_path = '' AS $$
BEGIN
  INSERT INTO public.audit_events (action, entity, entity_id, details)
  VALUES (
    'stage_health_snapshot_created',
    'stage_health_snapshots',
    NEW.id,
    jsonb_build_object(
      'tenant_id', NEW.tenant_id,
      'stage_instance_id', NEW.stage_instance_id,
      'health_status', NEW.health_status,
      'progress_percentage', NEW.progress_percentage,
      'tasks_overdue_count', NEW.tasks_overdue_count,
      'high_risk_count', NEW.high_risk_count,
      'snapshot_date', NEW.snapshot_date
    )
  );
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.log_workload_snapshot()
RETURNS trigger LANGUAGE plpgsql SET search_path = '' AS $$
BEGIN
  INSERT INTO public.audit_events (action, entity, entity_id, details)
  VALUES (
    'workload_snapshot_created',
    'workload_snapshots',
    NEW.id,
    jsonb_build_object(
      'user_id', NEW.user_id,
      'capacity_pct', NEW.capacity_utilisation_percentage,
      'overload_status', NEW.overload_risk_status,
      'snapshot_date', NEW.snapshot_date
    )
  );
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.set_user_type_from_role()
RETURNS trigger LANGUAGE plpgsql SET search_path = '' AS $$
DECLARE
  v_is_internal boolean;
BEGIN
  SELECT COALESCE(is_internal, false)
  INTO v_is_internal
  FROM public.dd_unicorn_roles
  WHERE value = NEW.unicorn_role;

  IF v_is_internal THEN
    NEW.user_type := 'Vivacity Team';
  ELSIF NEW.unicorn_role = 'Admin' THEN
    NEW.user_type := 'Client Parent';
  ELSIF NEW.unicorn_role IN ('User', 'Academy User') THEN
    NEW.user_type := 'Client Child';
  END IF;

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.sync_is_vivacity_internal()
RETURNS trigger LANGUAGE plpgsql SET search_path = '' AS $$
BEGIN
  SELECT COALESCE(is_internal, false)
  INTO NEW.is_vivacity_internal
  FROM public.dd_unicorn_roles
  WHERE value = NEW.unicorn_role;

  IF NOT FOUND THEN
    NEW.is_vivacity_internal := false;
  END IF;

  RETURN NEW;
END;
$$;

-- 5. Set security_invoker on views that are missing it (security_definer view finding)
ALTER VIEW public.v_auth_user_state SET (security_invoker = true);
ALTER VIEW public.v_client_package_dashboard SET (security_invoker = true);
ALTER VIEW public.v_client_package_stages SET (security_invoker = true);
ALTER VIEW public.v_admin_zero_progress_packages SET (security_invoker = true);
ALTER VIEW public.v_dashboard_labour_efficiency SET (security_invoker = true);
ALTER VIEW public.v_tenant_last_activity SET (security_invoker = true);
ALTER VIEW public.v_dashboard_tenant_portfolio SET (security_invoker = true);
ALTER VIEW public.v_client_governance_documents SET (security_invoker = true);
ALTER VIEW public.v_client_package_whats_next SET (security_invoker = true);
ALTER VIEW public.v_client_reporting_reminders SET (security_invoker = true);
ALTER VIEW public.v_client_home_feed SET (security_invoker = true);
