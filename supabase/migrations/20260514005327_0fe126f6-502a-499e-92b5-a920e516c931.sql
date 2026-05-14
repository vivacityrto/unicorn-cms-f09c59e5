CREATE TABLE public.addin_audit_log (
  id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_uuid    uuid        NOT NULL
                           REFERENCES public.users(user_uuid)
                           ON UPDATE CASCADE
                           ON DELETE RESTRICT,
  tenant_id    bigint      NULL
                           REFERENCES public.tenants(id)
                           ON UPDATE CASCADE
                           ON DELETE SET NULL,
  action       text        NOT NULL,
  record_type  text        NULL,
  record_id    text        NULL,
  surface      text        NULL,
  metadata     jsonb       NULL DEFAULT '{}'::jsonb,
  client_info  text        NULL,
  created_at   timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE  public.addin_audit_log
  IS 'Audit trail for Microsoft 365 add-in surface (Outlook / Teams / Word / Excel). Written by addinAudit.ts (user JWT) and addin-auth-exchange edge function (service role). Read by addin-diagnostics-usage. Free-text action; surface in {outlook_mail, outlook_calendar, teams_meeting, word, excel}.';
COMMENT ON COLUMN public.addin_audit_log.tenant_id
  IS 'Nullable: addin_opened events from addin-auth-exchange occur before tenant context is known. Action-execution events should populate tenant_id where available.';

CREATE INDEX idx_addin_audit_log_user_created
  ON public.addin_audit_log (user_uuid, created_at DESC);

CREATE INDEX idx_addin_audit_log_tenant_created
  ON public.addin_audit_log (tenant_id, created_at DESC)
  WHERE tenant_id IS NOT NULL;

CREATE INDEX idx_addin_audit_log_action_created
  ON public.addin_audit_log (action, created_at DESC);

ALTER TABLE public.addin_audit_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY addin_audit_log_self_insert
  ON public.addin_audit_log
  FOR INSERT
  TO authenticated
  WITH CHECK (user_uuid = (SELECT auth.uid()));

CREATE POLICY addin_audit_log_self_select
  ON public.addin_audit_log
  FOR SELECT
  TO authenticated
  USING (user_uuid = (SELECT auth.uid()));

CREATE POLICY addin_audit_log_staff_select
  ON public.addin_audit_log
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.users
      WHERE users.user_uuid = (SELECT auth.uid())
        AND users.unicorn_role = ANY (ARRAY['Super Admin'::unicorn_role, 'Team Leader'::unicorn_role])
    )
  );

REVOKE ALL ON public.addin_audit_log FROM PUBLIC;
GRANT SELECT, INSERT ON public.addin_audit_log TO authenticated;
GRANT ALL ON public.addin_audit_log TO service_role;

DO $$
BEGIN
  ASSERT (SELECT relrowsecurity FROM pg_class WHERE oid='public.addin_audit_log'::regclass),
    'RLS not enabled on addin_audit_log';
  ASSERT (SELECT count(*) FROM pg_policy WHERE polrelid='public.addin_audit_log'::regclass) = 3,
    'Expected 3 RLS policies';
  ASSERT (SELECT count(*) FROM pg_indexes
          WHERE schemaname='public' AND tablename='addin_audit_log') >= 4,
    'Expected at least 4 indexes (PK + 3 explicit)';
END $$;