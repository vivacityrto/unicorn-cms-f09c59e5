-- A) Create is_vivacity_staff helper (adapted for users table with user_uuid)
CREATE OR REPLACE FUNCTION public.is_vivacity_staff(p_user uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.users u
    WHERE u.user_uuid = p_user
      AND u.unicorn_role IN ('Super Admin','Team Leader','Team Member')
  );
$$;

-- A) Create can_access_tenant helper (using tenant_members)
CREATE OR REPLACE FUNCTION public.can_access_tenant(p_user uuid, p_tenant_id bigint)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.tenant_members tm
    WHERE tm.user_id = p_user
      AND tm.tenant_id = p_tenant_id
      AND tm.status = 'active'
  )
  OR public.is_vivacity_staff(p_user);
$$;

-- B) Create v_tenant_last_activity view
CREATE OR REPLACE VIEW public.v_tenant_last_activity WITH (security_invoker = true) AS
SELECT
  t.id AS tenant_id,
  GREATEST(
    COALESCE((SELECT MAX(di.updated_at) FROM public.document_instances di WHERE di.tenant_id = t.id), 'epoch'::timestamptz),
    COALESCE((SELECT MAX(n.updated_at) FROM public.notes n WHERE n.tenant_id = t.id), 'epoch'::timestamptz),
    COALESCE((SELECT MAX(m.updated_at) FROM public.meetings m WHERE m.tenant_id = t.id), 'epoch'::timestamptz),
    COALESCE((SELECT MAX(em.created_at) FROM public.email_messages em WHERE em.tenant_id = t.id), 'epoch'::timestamptz),
    COALESCE(t.created_at, 'epoch'::timestamptz)
  ) AS last_activity_at
FROM public.tenants t;

-- B) Optional indexes for performance
CREATE INDEX IF NOT EXISTS idx_doc_instances_tenant_updated_at
ON public.document_instances (tenant_id, updated_at DESC);

CREATE INDEX IF NOT EXISTS idx_notes_tenant_updated_at
ON public.notes (tenant_id, updated_at DESC);

CREATE INDEX IF NOT EXISTS idx_meetings_tenant_updated_at
ON public.meetings (tenant_id, updated_at DESC);

CREATE INDEX IF NOT EXISTS idx_email_messages_tenant_created_at
ON public.email_messages (tenant_id, created_at DESC);

-- E) system_job_runs RLS (email_messages already has policies)
ALTER TABLE public.system_job_runs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS system_job_runs_staff_read ON public.system_job_runs;
DROP POLICY IF EXISTS system_job_runs_staff_insert ON public.system_job_runs;

CREATE POLICY system_job_runs_staff_read
ON public.system_job_runs
FOR SELECT
TO authenticated
USING (public.is_vivacity_staff(auth.uid()));

CREATE POLICY system_job_runs_staff_insert
ON public.system_job_runs
FOR INSERT
TO authenticated
WITH CHECK (public.is_vivacity_staff(auth.uid()));