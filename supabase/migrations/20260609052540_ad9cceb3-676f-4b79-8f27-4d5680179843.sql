
-- =========================================================
-- Migration B: RBAC tables + 65-feature × 6-role seed
-- =========================================================

-- ---- Pre-flight ------------------------------------------
DO $$
DECLARE v_roles integer;
BEGIN
  SELECT count(*) INTO v_roles FROM public.dd_unicorn_roles;
  IF v_roles <> 10 THEN
    RAISE EXCEPTION 'Migration B pre-flight: expected 10 roles, found %', v_roles;
  END IF;
END $$;

-- ---- 1. Permission level ENUM ----------------------------
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'permission_level') THEN
    CREATE TYPE public.permission_level AS ENUM ('full','limited','owner_only','none');
  END IF;
END $$;

-- =========================================================
-- 2. permission_features
-- =========================================================
CREATE TABLE public.permission_features (
  feature_key  text PRIMARY KEY,
  label        text NOT NULL,
  module       text NOT NULL,
  category     text NOT NULL,
  description  text,
  is_active    boolean NOT NULL DEFAULT true,
  sort_order   integer NOT NULL DEFAULT 0,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.permission_features TO authenticated;
GRANT ALL    ON public.permission_features TO service_role;

ALTER TABLE public.permission_features ENABLE ROW LEVEL SECURITY;

CREATE POLICY "permission_features_select_authenticated"
  ON public.permission_features FOR SELECT TO authenticated USING (true);

CREATE POLICY "permission_features_insert_super_admin"
  ON public.permission_features FOR INSERT TO authenticated
  WITH CHECK (public.is_super_admin_safe(auth.uid()));

CREATE POLICY "permission_features_update_super_admin"
  ON public.permission_features FOR UPDATE TO authenticated
  USING (public.is_super_admin_safe(auth.uid()))
  WITH CHECK (public.is_super_admin_safe(auth.uid()));

CREATE POLICY "permission_features_delete_super_admin"
  ON public.permission_features FOR DELETE TO authenticated
  USING (public.is_super_admin_safe(auth.uid()));

-- =========================================================
-- 3. role_permissions
-- =========================================================
CREATE TABLE public.role_permissions (
  id           bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  role         text NOT NULL REFERENCES public.dd_unicorn_roles(value)
                 ON DELETE RESTRICT ON UPDATE CASCADE,
  feature_key  text NOT NULL REFERENCES public.permission_features(feature_key)
                 ON DELETE CASCADE ON UPDATE CASCADE,
  level        public.permission_level NOT NULL,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now(),
  UNIQUE (role, feature_key)
);

CREATE INDEX role_permissions_role_idx        ON public.role_permissions (role);
CREATE INDEX role_permissions_feature_key_idx ON public.role_permissions (feature_key);

GRANT SELECT ON public.role_permissions TO authenticated;
GRANT ALL    ON public.role_permissions TO service_role;

ALTER TABLE public.role_permissions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "role_permissions_select_staff"
  ON public.role_permissions FOR SELECT TO authenticated
  USING (public.is_vivacity_team_safe(auth.uid()));

CREATE POLICY "role_permissions_insert_super_admin"
  ON public.role_permissions FOR INSERT TO authenticated
  WITH CHECK (public.is_super_admin_safe(auth.uid()));

CREATE POLICY "role_permissions_update_super_admin"
  ON public.role_permissions FOR UPDATE TO authenticated
  USING (public.is_super_admin_safe(auth.uid()))
  WITH CHECK (public.is_super_admin_safe(auth.uid()));

CREATE POLICY "role_permissions_delete_super_admin"
  ON public.role_permissions FOR DELETE TO authenticated
  USING (public.is_super_admin_safe(auth.uid()));

-- =========================================================
-- 4. user_roles
-- =========================================================
CREATE TABLE public.user_roles (
  id          bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_uuid   uuid NOT NULL REFERENCES public.users(user_uuid)
                ON DELETE CASCADE ON UPDATE CASCADE,
  role        text NOT NULL REFERENCES public.dd_unicorn_roles(value)
                ON DELETE RESTRICT ON UPDATE CASCADE,
  granted_by  uuid REFERENCES public.users(user_uuid) ON UPDATE CASCADE,
  granted_at  timestamptz NOT NULL DEFAULT now(),
  expires_at  timestamptz NULL,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_uuid, role)
);

CREATE INDEX user_roles_user_uuid_idx ON public.user_roles (user_uuid);
CREATE INDEX user_roles_role_idx      ON public.user_roles (role);

GRANT SELECT ON public.user_roles TO authenticated;
GRANT ALL    ON public.user_roles TO service_role;

ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "user_roles_select_self_or_staff"
  ON public.user_roles FOR SELECT TO authenticated
  USING (auth.uid() = user_uuid OR public.is_vivacity_team_safe(auth.uid()));

CREATE POLICY "user_roles_insert_super_admin"
  ON public.user_roles FOR INSERT TO authenticated
  WITH CHECK (public.is_super_admin_safe(auth.uid()));

CREATE POLICY "user_roles_update_super_admin"
  ON public.user_roles FOR UPDATE TO authenticated
  USING (public.is_super_admin_safe(auth.uid()))
  WITH CHECK (public.is_super_admin_safe(auth.uid()));

CREATE POLICY "user_roles_delete_super_admin"
  ON public.user_roles FOR DELETE TO authenticated
  USING (public.is_super_admin_safe(auth.uid()));

-- =========================================================
-- 5. permission_change_log
-- =========================================================
CREATE TABLE public.permission_change_log (
  id          bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  actor_uuid  uuid NULL REFERENCES public.users(user_uuid) ON UPDATE CASCADE,
  entity      text NOT NULL CHECK (entity IN ('role_permissions','user_roles','permission_features')),
  entity_id   text NOT NULL,
  action      text NOT NULL CHECK (action IN ('insert','update','delete')),
  before      jsonb,
  after       jsonb,
  reason      text,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX permission_change_log_entity_idx     ON public.permission_change_log (entity);
CREATE INDEX permission_change_log_created_at_idx ON public.permission_change_log (created_at DESC);

GRANT SELECT ON public.permission_change_log TO authenticated;
GRANT ALL    ON public.permission_change_log TO service_role;

ALTER TABLE public.permission_change_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "permission_change_log_select_staff"
  ON public.permission_change_log FOR SELECT TO authenticated
  USING (public.is_vivacity_team_safe(auth.uid()));

CREATE POLICY "permission_change_log_insert_super_admin"
  ON public.permission_change_log FOR INSERT TO authenticated
  WITH CHECK (public.is_super_admin_safe(auth.uid()));

-- =========================================================
-- 6. updated_at + change-log triggers
-- =========================================================
CREATE OR REPLACE FUNCTION public.touch_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER permission_features_touch_updated_at
  BEFORE UPDATE ON public.permission_features
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

CREATE TRIGGER role_permissions_touch_updated_at
  BEFORE UPDATE ON public.role_permissions
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

CREATE TRIGGER user_roles_touch_updated_at
  BEFORE UPDATE ON public.user_roles
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- Generic change-logger (SECURITY DEFINER so trigger can write log row)
CREATE OR REPLACE FUNCTION public.log_permission_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_entity_id text;
  v_before    jsonb;
  v_after     jsonb;
  v_action    text;
BEGIN
  IF TG_OP = 'INSERT' THEN
    v_action := 'insert';
    v_before := NULL;
    v_after  := to_jsonb(NEW);
    v_entity_id := COALESCE((to_jsonb(NEW)->>'id'), (to_jsonb(NEW)->>'feature_key'));
  ELSIF TG_OP = 'UPDATE' THEN
    v_action := 'update';
    v_before := to_jsonb(OLD);
    v_after  := to_jsonb(NEW);
    v_entity_id := COALESCE((to_jsonb(NEW)->>'id'), (to_jsonb(NEW)->>'feature_key'));
  ELSE
    v_action := 'delete';
    v_before := to_jsonb(OLD);
    v_after  := NULL;
    v_entity_id := COALESCE((to_jsonb(OLD)->>'id'), (to_jsonb(OLD)->>'feature_key'));
  END IF;

  INSERT INTO public.permission_change_log
    (actor_uuid, entity, entity_id, action, before, after)
  VALUES
    (auth.uid(), TG_TABLE_NAME, v_entity_id, v_action, v_before, v_after);

  RETURN COALESCE(NEW, OLD);
END;
$$;

REVOKE ALL ON FUNCTION public.log_permission_change() FROM PUBLIC;

CREATE TRIGGER permission_features_change_log
  AFTER INSERT OR UPDATE OR DELETE ON public.permission_features
  FOR EACH ROW EXECUTE FUNCTION public.log_permission_change();

CREATE TRIGGER role_permissions_change_log
  AFTER INSERT OR UPDATE OR DELETE ON public.role_permissions
  FOR EACH ROW EXECUTE FUNCTION public.log_permission_change();

CREATE TRIGGER user_roles_change_log
  AFTER INSERT OR UPDATE OR DELETE ON public.user_roles
  FOR EACH ROW EXECUTE FUNCTION public.log_permission_change();

-- =========================================================
-- 7. Seed: permission_features (65 rows)
-- =========================================================
INSERT INTO public.permission_features (feature_key, label, module, category, sort_order) VALUES
('admin.team_users.manage','Team user management','Administration','Administration',10),
('admin.tenant_users.manage','Tenant user management','Administration','Administration',20),
('admin.invites.manage','Manage invites','Administration','Administration',30),
('admin.cohort.send','Cohort sender','Administration','Administration',40),
('admin.audit_log.view','System audit logs','Administration','Administration',50),
('admin.email_templates.manage','Email templates (system)','Administration','Administration',60),
('admin.system_config.manage','System / kit config','Administration','Administration',70),
('admin.academy_mgmt.manage','Academy management console','Administration','Administration',80),
('clients.profile.view','View client profile & timeline','Clients','Client Management',100),
('clients.login_history.view','View client login history','Clients','Client Management',110),
('clients.details.edit','Edit client details','Clients','Client Management',120),
('clients.activate','Activate a client','Clients','Client Management',130),
('clients.create','Create / set up client','Clients','Client Management',140),
('clients.deactivate','Deactivate / close client','Clients','Client Management',150),
('packages.view','View package & progress','Packages','Packages',200),
('packages.items.tick','Tick off package items','Packages','Packages',210),
('packages.notes.add','Add notes / log time / share','Packages','Packages',220),
('packages.create','Create / start a package','Packages','Packages',230),
('packages.close','Close a package','Packages','Packages',240),
('eos.overview.view','EOS Overview — view','EOS','EOS — Overview',300),
('eos.leadership_dashboard.view','Leadership Dashboard','EOS','EOS — Dashboard',310),
('eos.scorecard.view','Scorecard — view','EOS','EOS — Scorecard',320),
('eos.scorecard.update_own','Scorecard — update own metric','EOS','EOS — Scorecard',330),
('eos.scorecard.manage','Scorecard — configure','EOS','EOS — Scorecard',340),
('eos.mission_control.view','Mission Control — view','EOS','EOS — Mission Control',350),
('eos.mission_control.edit','Mission Control — edit','EOS','EOS — Mission Control',360),
('eos.flight_plan.view','Flight Plan — view','EOS','EOS — Flight Plan',370),
('eos.flight_plan.edit','Flight Plan — edit','EOS','EOS — Flight Plan',380),
('eos.rocks.company.create','Company Rock — create/edit','EOS','EOS — Rocks',390),
('eos.rocks.view','Company Rock — view','EOS','EOS — Rocks',400),
('eos.rocks.own.manage','Rock — tasks on own Rock','EOS','EOS — Rocks',410),
('eos.todos.own','Add To-Do for yourself','EOS','EOS — To-Dos',420),
('eos.todos.others','Add To-Do for others','EOS','EOS — To-Dos',430),
('eos.meetings.l10.participate','L10 — participate','EOS','EOS — Meetings',440),
('eos.meetings.l10.create','L10 — create / configure','EOS','EOS — Meetings',450),
('eos.meetings.samepage','Same Page Meeting','EOS','EOS — Meetings',460),
('eos.meetings.quarterly','Quarterly / Annual — create','EOS','EOS — Meetings',470),
('eos.qc.create','Create QC (schedule)','EOS','EOS — Quarterly Conversations',480),
('eos.qc.own','View & submit own QC','EOS','EOS — Quarterly Conversations',490),
('eos.qc.all','View all QCs (manager)','EOS','EOS — Quarterly Conversations',500),
('eos.gwc_trends.view','GWC Trends','EOS','EOS — Analytics',510),
('eos.rock_analysis.view','Rock Success Analysis','EOS','EOS — Analytics',520),
('eos.client_impact.view','Client Impact Reporting','EOS','EOS — Analytics',530),
('eos.processes.view','View processes','EOS','EOS — Processes',540),
('eos.processes.create','Create / edit process','EOS','EOS — Processes',550),
('eos.processes.publish','Approve / publish process','EOS','EOS — Processes',560),
('academy.tenant_access.manage','Manage tenant access','Academy','Academy — Tenant Access',600),
('academy.enrolments.view','View all enrolments','Academy','Academy — Enrolments',610),
('academy.enrolments.create','Enrol a client in training','Academy','Academy — Enrolments',620),
('academy.enrolments.revoke','Revoke / expire enrolment','Academy','Academy — Enrolments',630),
('academy.certificates.view','View all certificates','Academy','Academy — Certificates',640),
('academy.certificates.issue','Issue / revoke certificate','Academy','Academy — Certificates',650),
('academy.builder.view','View course library','Academy','Academy — Builder',660),
('academy.builder.edit','Create / edit courses','Academy','Academy — Builder',670),
('academy.builder.publish','Publish / unpublish course','Academy','Academy — Builder',680),
('academy.mapping.view','View mapping matrix','Academy','Academy — Mapping',690),
('academy.mapping.edit','Create / edit mapping rules','Academy','Academy — Mapping',700),
('audits.setup','Set up / create an audit','Audits','Audits',900),
('audits.operate','Operate / run the audit','Audits','Audits',910),
('audits.view','View audit results','Audits','Audits',920),
('audits.report','Generate & release report','Audits','Audits',930),
('resource_hub.view','View / browse resources','Resource Hub','Resource Hub',800),
('resource_hub.upload','Upload / create resource','Resource Hub','Resource Hub',810),
('resource_hub.approve','Approve & publish resource','Resource Hub','Resource Hub',820),
('resource_hub.archive','Archive / remove resource','Resource Hub','Resource Hub',830)
ON CONFLICT (feature_key) DO NOTHING;

-- =========================================================
-- 8. Seed: role_permissions (390 rows)
-- =========================================================
INSERT INTO public.role_permissions (feature_key, role, level) VALUES
('admin.team_users.manage','Super Admin','full'),('admin.team_users.manage','Team Leader','none'),('admin.team_users.manage','Integrator','none'),('admin.team_users.manage','BGT','none'),('admin.team_users.manage','CSC','none'),('admin.team_users.manage','CET','none'),
('admin.tenant_users.manage','Super Admin','full'),('admin.tenant_users.manage','Team Leader','none'),('admin.tenant_users.manage','Integrator','none'),('admin.tenant_users.manage','BGT','none'),('admin.tenant_users.manage','CSC','none'),('admin.tenant_users.manage','CET','none'),
('admin.invites.manage','Super Admin','full'),('admin.invites.manage','Team Leader','none'),('admin.invites.manage','Integrator','none'),('admin.invites.manage','BGT','none'),('admin.invites.manage','CSC','none'),('admin.invites.manage','CET','none'),
('admin.cohort.send','Super Admin','full'),('admin.cohort.send','Team Leader','none'),('admin.cohort.send','Integrator','none'),('admin.cohort.send','BGT','none'),('admin.cohort.send','CSC','none'),('admin.cohort.send','CET','none'),
('admin.audit_log.view','Super Admin','full'),('admin.audit_log.view','Team Leader','none'),('admin.audit_log.view','Integrator','none'),('admin.audit_log.view','BGT','none'),('admin.audit_log.view','CSC','none'),('admin.audit_log.view','CET','none'),
('admin.email_templates.manage','Super Admin','full'),('admin.email_templates.manage','Team Leader','none'),('admin.email_templates.manage','Integrator','none'),('admin.email_templates.manage','BGT','none'),('admin.email_templates.manage','CSC','none'),('admin.email_templates.manage','CET','none'),
('admin.system_config.manage','Super Admin','full'),('admin.system_config.manage','Team Leader','none'),('admin.system_config.manage','Integrator','none'),('admin.system_config.manage','BGT','none'),('admin.system_config.manage','CSC','none'),('admin.system_config.manage','CET','none'),
('admin.academy_mgmt.manage','Super Admin','full'),('admin.academy_mgmt.manage','Team Leader','none'),('admin.academy_mgmt.manage','Integrator','none'),('admin.academy_mgmt.manage','BGT','none'),('admin.academy_mgmt.manage','CSC','none'),('admin.academy_mgmt.manage','CET','none'),
('clients.profile.view','Super Admin','full'),('clients.profile.view','Team Leader','full'),('clients.profile.view','Integrator','full'),('clients.profile.view','BGT','full'),('clients.profile.view','CSC','full'),('clients.profile.view','CET','full'),
('clients.login_history.view','Super Admin','full'),('clients.login_history.view','Team Leader','full'),('clients.login_history.view','Integrator','full'),('clients.login_history.view','BGT','full'),('clients.login_history.view','CSC','full'),('clients.login_history.view','CET','full'),
('clients.details.edit','Super Admin','full'),('clients.details.edit','Team Leader','full'),('clients.details.edit','Integrator','none'),('clients.details.edit','BGT','limited'),('clients.details.edit','CSC','limited'),('clients.details.edit','CET','none'),
('clients.activate','Super Admin','full'),('clients.activate','Team Leader','none'),('clients.activate','Integrator','none'),('clients.activate','BGT','none'),('clients.activate','CSC','none'),('clients.activate','CET','none'),
('clients.create','Super Admin','full'),('clients.create','Team Leader','none'),('clients.create','Integrator','none'),('clients.create','BGT','none'),('clients.create','CSC','none'),('clients.create','CET','none'),
('clients.deactivate','Super Admin','full'),('clients.deactivate','Team Leader','none'),('clients.deactivate','Integrator','none'),('clients.deactivate','BGT','none'),('clients.deactivate','CSC','none'),('clients.deactivate','CET','none'),
('packages.view','Super Admin','full'),('packages.view','Team Leader','full'),('packages.view','Integrator','full'),('packages.view','BGT','full'),('packages.view','CSC','full'),('packages.view','CET','full'),
('packages.items.tick','Super Admin','full'),('packages.items.tick','Team Leader','full'),('packages.items.tick','Integrator','full'),('packages.items.tick','BGT','full'),('packages.items.tick','CSC','full'),('packages.items.tick','CET','full'),
('packages.notes.add','Super Admin','full'),('packages.notes.add','Team Leader','full'),('packages.notes.add','Integrator','full'),('packages.notes.add','BGT','full'),('packages.notes.add','CSC','full'),('packages.notes.add','CET','full'),
('packages.create','Super Admin','full'),('packages.create','Team Leader','none'),('packages.create','Integrator','none'),('packages.create','BGT','none'),('packages.create','CSC','none'),('packages.create','CET','none'),
('packages.close','Super Admin','full'),('packages.close','Team Leader','none'),('packages.close','Integrator','none'),('packages.close','BGT','none'),('packages.close','CSC','none'),('packages.close','CET','none'),
('eos.overview.view','Super Admin','full'),('eos.overview.view','Team Leader','full'),('eos.overview.view','Integrator','full'),('eos.overview.view','BGT','full'),('eos.overview.view','CSC','full'),('eos.overview.view','CET','full'),
('eos.leadership_dashboard.view','Super Admin','full'),('eos.leadership_dashboard.view','Team Leader','full'),('eos.leadership_dashboard.view','Integrator','none'),('eos.leadership_dashboard.view','BGT','none'),('eos.leadership_dashboard.view','CSC','none'),('eos.leadership_dashboard.view','CET','none'),
('eos.scorecard.view','Super Admin','full'),('eos.scorecard.view','Team Leader','full'),('eos.scorecard.view','Integrator','full'),('eos.scorecard.view','BGT','full'),('eos.scorecard.view','CSC','full'),('eos.scorecard.view','CET','full'),
('eos.scorecard.update_own','Super Admin','full'),('eos.scorecard.update_own','Team Leader','full'),('eos.scorecard.update_own','Integrator','owner_only'),('eos.scorecard.update_own','BGT','owner_only'),('eos.scorecard.update_own','CSC','owner_only'),('eos.scorecard.update_own','CET','owner_only'),
('eos.scorecard.manage','Super Admin','full'),('eos.scorecard.manage','Team Leader','full'),('eos.scorecard.manage','Integrator','none'),('eos.scorecard.manage','BGT','none'),('eos.scorecard.manage','CSC','none'),('eos.scorecard.manage','CET','none'),
('eos.mission_control.view','Super Admin','full'),('eos.mission_control.view','Team Leader','full'),('eos.mission_control.view','Integrator','full'),('eos.mission_control.view','BGT','full'),('eos.mission_control.view','CSC','full'),('eos.mission_control.view','CET','full'),
('eos.mission_control.edit','Super Admin','full'),('eos.mission_control.edit','Team Leader','full'),('eos.mission_control.edit','Integrator','none'),('eos.mission_control.edit','BGT','none'),('eos.mission_control.edit','CSC','none'),('eos.mission_control.edit','CET','none'),
('eos.flight_plan.view','Super Admin','full'),('eos.flight_plan.view','Team Leader','full'),('eos.flight_plan.view','Integrator','full'),('eos.flight_plan.view','BGT','full'),('eos.flight_plan.view','CSC','full'),('eos.flight_plan.view','CET','full'),
('eos.flight_plan.edit','Super Admin','full'),('eos.flight_plan.edit','Team Leader','full'),('eos.flight_plan.edit','Integrator','none'),('eos.flight_plan.edit','BGT','none'),('eos.flight_plan.edit','CSC','none'),('eos.flight_plan.edit','CET','none'),
('eos.rocks.company.create','Super Admin','full'),('eos.rocks.company.create','Team Leader','full'),('eos.rocks.company.create','Integrator','none'),('eos.rocks.company.create','BGT','none'),('eos.rocks.company.create','CSC','none'),('eos.rocks.company.create','CET','none'),
('eos.rocks.view','Super Admin','full'),('eos.rocks.view','Team Leader','full'),('eos.rocks.view','Integrator','full'),('eos.rocks.view','BGT','full'),('eos.rocks.view','CSC','full'),('eos.rocks.view','CET','full'),
('eos.rocks.own.manage','Super Admin','full'),('eos.rocks.own.manage','Team Leader','full'),('eos.rocks.own.manage','Integrator','full'),('eos.rocks.own.manage','BGT','full'),('eos.rocks.own.manage','CSC','full'),('eos.rocks.own.manage','CET','full'),
('eos.todos.own','Super Admin','full'),('eos.todos.own','Team Leader','full'),('eos.todos.own','Integrator','full'),('eos.todos.own','BGT','full'),('eos.todos.own','CSC','full'),('eos.todos.own','CET','full'),
('eos.todos.others','Super Admin','full'),('eos.todos.others','Team Leader','full'),('eos.todos.others','Integrator','full'),('eos.todos.others','BGT','none'),('eos.todos.others','CSC','none'),('eos.todos.others','CET','none'),
('eos.meetings.l10.participate','Super Admin','full'),('eos.meetings.l10.participate','Team Leader','full'),('eos.meetings.l10.participate','Integrator','full'),('eos.meetings.l10.participate','BGT','full'),('eos.meetings.l10.participate','CSC','full'),('eos.meetings.l10.participate','CET','full'),
('eos.meetings.l10.create','Super Admin','full'),('eos.meetings.l10.create','Team Leader','full'),('eos.meetings.l10.create','Integrator','full'),('eos.meetings.l10.create','BGT','none'),('eos.meetings.l10.create','CSC','none'),('eos.meetings.l10.create','CET','none'),
('eos.meetings.samepage','Super Admin','full'),('eos.meetings.samepage','Team Leader','full'),('eos.meetings.samepage','Integrator','full'),('eos.meetings.samepage','BGT','none'),('eos.meetings.samepage','CSC','none'),('eos.meetings.samepage','CET','none'),
('eos.meetings.quarterly','Super Admin','full'),('eos.meetings.quarterly','Team Leader','full'),('eos.meetings.quarterly','Integrator','none'),('eos.meetings.quarterly','BGT','none'),('eos.meetings.quarterly','CSC','none'),('eos.meetings.quarterly','CET','none'),
('eos.qc.create','Super Admin','full'),('eos.qc.create','Team Leader','full'),('eos.qc.create','Integrator','none'),('eos.qc.create','BGT','none'),('eos.qc.create','CSC','none'),('eos.qc.create','CET','none'),
('eos.qc.own','Super Admin','full'),('eos.qc.own','Team Leader','full'),('eos.qc.own','Integrator','owner_only'),('eos.qc.own','BGT','owner_only'),('eos.qc.own','CSC','owner_only'),('eos.qc.own','CET','owner_only'),
('eos.qc.all','Super Admin','full'),('eos.qc.all','Team Leader','full'),('eos.qc.all','Integrator','none'),('eos.qc.all','BGT','none'),('eos.qc.all','CSC','none'),('eos.qc.all','CET','none'),
('eos.gwc_trends.view','Super Admin','full'),('eos.gwc_trends.view','Team Leader','full'),('eos.gwc_trends.view','Integrator','none'),('eos.gwc_trends.view','BGT','none'),('eos.gwc_trends.view','CSC','none'),('eos.gwc_trends.view','CET','none'),
('eos.rock_analysis.view','Super Admin','full'),('eos.rock_analysis.view','Team Leader','full'),('eos.rock_analysis.view','Integrator','none'),('eos.rock_analysis.view','BGT','none'),('eos.rock_analysis.view','CSC','none'),('eos.rock_analysis.view','CET','none'),
('eos.client_impact.view','Super Admin','full'),('eos.client_impact.view','Team Leader','full'),('eos.client_impact.view','Integrator','none'),('eos.client_impact.view','BGT','none'),('eos.client_impact.view','CSC','none'),('eos.client_impact.view','CET','none'),
('eos.processes.view','Super Admin','full'),('eos.processes.view','Team Leader','full'),('eos.processes.view','Integrator','full'),('eos.processes.view','BGT','full'),('eos.processes.view','CSC','full'),('eos.processes.view','CET','full'),
('eos.processes.create','Super Admin','full'),('eos.processes.create','Team Leader','full'),('eos.processes.create','Integrator','full'),('eos.processes.create','BGT','none'),('eos.processes.create','CSC','none'),('eos.processes.create','CET','none'),
('eos.processes.publish','Super Admin','full'),('eos.processes.publish','Team Leader','full'),('eos.processes.publish','Integrator','none'),('eos.processes.publish','BGT','none'),('eos.processes.publish','CSC','none'),('eos.processes.publish','CET','none'),
('academy.tenant_access.manage','Super Admin','full'),('academy.tenant_access.manage','Team Leader','full'),('academy.tenant_access.manage','Integrator','none'),('academy.tenant_access.manage','BGT','none'),('academy.tenant_access.manage','CSC','none'),('academy.tenant_access.manage','CET','none'),
('academy.enrolments.view','Super Admin','full'),('academy.enrolments.view','Team Leader','full'),('academy.enrolments.view','Integrator','full'),('academy.enrolments.view','BGT','full'),('academy.enrolments.view','CSC','full'),('academy.enrolments.view','CET','full'),
('academy.enrolments.create','Super Admin','full'),('academy.enrolments.create','Team Leader','full'),('academy.enrolments.create','Integrator','none'),('academy.enrolments.create','BGT','full'),('academy.enrolments.create','CSC','full'),('academy.enrolments.create','CET','none'),
('academy.enrolments.revoke','Super Admin','full'),('academy.enrolments.revoke','Team Leader','full'),('academy.enrolments.revoke','Integrator','none'),('academy.enrolments.revoke','BGT','none'),('academy.enrolments.revoke','CSC','none'),('academy.enrolments.revoke','CET','none'),
('academy.certificates.view','Super Admin','full'),('academy.certificates.view','Team Leader','full'),('academy.certificates.view','Integrator','full'),('academy.certificates.view','BGT','full'),('academy.certificates.view','CSC','full'),('academy.certificates.view','CET','full'),
('academy.certificates.issue','Super Admin','full'),('academy.certificates.issue','Team Leader','full'),('academy.certificates.issue','Integrator','none'),('academy.certificates.issue','BGT','none'),('academy.certificates.issue','CSC','none'),('academy.certificates.issue','CET','none'),
('academy.builder.view','Super Admin','full'),('academy.builder.view','Team Leader','full'),('academy.builder.view','Integrator','full'),('academy.builder.view','BGT','full'),('academy.builder.view','CSC','full'),('academy.builder.view','CET','full'),
('academy.builder.edit','Super Admin','full'),('academy.builder.edit','Team Leader','full'),('academy.builder.edit','Integrator','none'),('academy.builder.edit','BGT','full'),('academy.builder.edit','CSC','none'),('academy.builder.edit','CET','none'),
('academy.builder.publish','Super Admin','full'),('academy.builder.publish','Team Leader','full'),('academy.builder.publish','Integrator','none'),('academy.builder.publish','BGT','none'),('academy.builder.publish','CSC','none'),('academy.builder.publish','CET','none'),
('academy.mapping.view','Super Admin','full'),('academy.mapping.view','Team Leader','full'),('academy.mapping.view','Integrator','full'),('academy.mapping.view','BGT','none'),('academy.mapping.view','CSC','none'),('academy.mapping.view','CET','none'),
('academy.mapping.edit','Super Admin','full'),('academy.mapping.edit','Team Leader','full'),('academy.mapping.edit','Integrator','none'),('academy.mapping.edit','BGT','none'),('academy.mapping.edit','CSC','none'),('academy.mapping.edit','CET','none'),
('audits.setup','Super Admin','full'),('audits.setup','Team Leader','full'),('audits.setup','Integrator','none'),('audits.setup','BGT','none'),('audits.setup','CSC','full'),('audits.setup','CET','none'),
('audits.operate','Super Admin','full'),('audits.operate','Team Leader','full'),('audits.operate','Integrator','none'),('audits.operate','BGT','none'),('audits.operate','CSC','none'),('audits.operate','CET','none'),
('audits.view','Super Admin','full'),('audits.view','Team Leader','full'),('audits.view','Integrator','full'),('audits.view','BGT','full'),('audits.view','CSC','full'),('audits.view','CET','full'),
('audits.report','Super Admin','full'),('audits.report','Team Leader','full'),('audits.report','Integrator','none'),('audits.report','BGT','none'),('audits.report','CSC','none'),('audits.report','CET','none'),
('resource_hub.view','Super Admin','full'),('resource_hub.view','Team Leader','full'),('resource_hub.view','Integrator','full'),('resource_hub.view','BGT','full'),('resource_hub.view','CSC','full'),('resource_hub.view','CET','full'),
('resource_hub.upload','Super Admin','full'),('resource_hub.upload','Team Leader','full'),('resource_hub.upload','Integrator','full'),('resource_hub.upload','BGT','full'),('resource_hub.upload','CSC','full'),('resource_hub.upload','CET','none'),
('resource_hub.approve','Super Admin','full'),('resource_hub.approve','Team Leader','full'),('resource_hub.approve','Integrator','none'),('resource_hub.approve','BGT','none'),('resource_hub.approve','CSC','none'),('resource_hub.approve','CET','none'),
('resource_hub.archive','Super Admin','full'),('resource_hub.archive','Team Leader','full'),('resource_hub.archive','Integrator','none'),('resource_hub.archive','BGT','none'),('resource_hub.archive','CSC','none'),('resource_hub.archive','CET','none')
ON CONFLICT (role, feature_key) DO UPDATE SET level = EXCLUDED.level;

-- =========================================================
-- 9. Post-flight assertions
-- =========================================================
DO $$
DECLARE
  v_features  integer;
  v_perms     integer;
  v_distinct_roles    integer;
  v_distinct_features integer;
  v_orphan_roles      integer;
  v_orphan_features   integer;
BEGIN
  SELECT count(*) INTO v_features FROM public.permission_features;
  IF v_features <> 65 THEN
    RAISE EXCEPTION 'Migration B post-flight: expected 65 permission_features, found %', v_features;
  END IF;

  SELECT count(*) INTO v_perms FROM public.role_permissions;
  IF v_perms <> 390 THEN
    RAISE EXCEPTION 'Migration B post-flight: expected 390 role_permissions, found %', v_perms;
  END IF;

  SELECT count(DISTINCT role) INTO v_distinct_roles FROM public.role_permissions;
  IF v_distinct_roles <> 6 THEN
    RAISE EXCEPTION 'Migration B post-flight: expected 6 distinct roles in matrix, found %', v_distinct_roles;
  END IF;

  SELECT count(DISTINCT feature_key) INTO v_distinct_features FROM public.role_permissions;
  IF v_distinct_features <> 65 THEN
    RAISE EXCEPTION 'Migration B post-flight: expected 65 distinct feature_keys in matrix, found %', v_distinct_features;
  END IF;

  SELECT count(*) INTO v_orphan_roles
  FROM public.role_permissions rp
  LEFT JOIN public.dd_unicorn_roles r ON r.value = rp.role
  WHERE r.value IS NULL;
  IF v_orphan_roles <> 0 THEN
    RAISE EXCEPTION 'Migration B post-flight: % role_permissions rows reference unknown role', v_orphan_roles;
  END IF;

  SELECT count(*) INTO v_orphan_features
  FROM public.role_permissions rp
  LEFT JOIN public.permission_features f ON f.feature_key = rp.feature_key
  WHERE f.feature_key IS NULL;
  IF v_orphan_features <> 0 THEN
    RAISE EXCEPTION 'Migration B post-flight: % role_permissions rows reference unknown feature_key', v_orphan_features;
  END IF;
END $$;
