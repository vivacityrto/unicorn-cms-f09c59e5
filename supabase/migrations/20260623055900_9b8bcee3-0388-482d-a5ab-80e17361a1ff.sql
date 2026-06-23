-- Phase 2: KPI Module Core Tables
-- Creates kpi_email_log, kpi_tasks, kpi_tickets, kpi_ticket_comms, kpi_reviews,
-- kpi_review_signoffs, kpi_dev_milestones with RLS using existing helpers.

-- =====================================================================
-- 1. kpi_email_log — CST email tracking (SLA 1 general / SLA 2 client_message)
-- =====================================================================
CREATE TABLE public.kpi_email_log (
  id            BIGSERIAL PRIMARY KEY,
  user_uuid     UUID NOT NULL REFERENCES public.users(user_uuid) ON DELETE CASCADE,
  tenant_id     BIGINT NULL REFERENCES public.tenants(id) ON DELETE SET NULL,
  email_type    TEXT NOT NULL,
  direction     TEXT NOT NULL CHECK (direction IN ('inbound','outbound')),
  message_id    TEXT NOT NULL,
  conversation_id TEXT NULL,
  subject       TEXT NULL,
  from_address  TEXT NULL,
  to_address    TEXT NULL,
  received_at   TIMESTAMPTZ NULL,
  sent_at       TIMESTAMPTZ NULL,
  responded_at  TIMESTAMPTZ NULL,
  response_minutes INTEGER NULL,
  sla_met       BOOLEAN NULL,
  raw_folder    TEXT NULL,
  metadata      JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_uuid, message_id)
);
ALTER TABLE public.kpi_email_log
  ADD CONSTRAINT kpi_email_log_email_type_fk
  FOREIGN KEY (email_type) REFERENCES public.dd_kpi_email_type(value) NOT VALID;

CREATE INDEX idx_kpi_email_log_user_received ON public.kpi_email_log (user_uuid, received_at DESC);
CREATE INDEX idx_kpi_email_log_conversation  ON public.kpi_email_log (conversation_id);
CREATE INDEX idx_kpi_email_log_tenant        ON public.kpi_email_log (tenant_id);
CREATE INDEX idx_kpi_email_log_type          ON public.kpi_email_log (email_type);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.kpi_email_log TO authenticated;
GRANT USAGE, SELECT ON SEQUENCE public.kpi_email_log_id_seq TO authenticated;
GRANT ALL ON public.kpi_email_log TO service_role;
GRANT ALL ON SEQUENCE public.kpi_email_log_id_seq TO service_role;

ALTER TABLE public.kpi_email_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "kpi_email_log own rows" ON public.kpi_email_log
  FOR SELECT TO authenticated
  USING (user_uuid = auth.uid());

CREATE POLICY "kpi_email_log reviewer read" ON public.kpi_email_log
  FOR SELECT TO authenticated
  USING (public.is_kpi_reviewer_safe(auth.uid()) OR public.is_super_admin_safe(auth.uid()));

CREATE POLICY "kpi_email_log superadmin manage" ON public.kpi_email_log
  FOR ALL TO authenticated
  USING (public.is_super_admin_safe(auth.uid()))
  WITH CHECK (public.is_super_admin_safe(auth.uid()));

CREATE TRIGGER trg_kpi_email_log_updated_at
  BEFORE UPDATE ON public.kpi_email_log
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- =====================================================================
-- 2. kpi_tasks — CST internal task tracking
-- =====================================================================
CREATE TABLE public.kpi_tasks (
  id            BIGSERIAL PRIMARY KEY,
  assignee_uuid UUID NOT NULL REFERENCES public.users(user_uuid) ON DELETE CASCADE,
  assigned_by   UUID NULL REFERENCES public.users(user_uuid) ON DELETE SET NULL,
  tenant_id     BIGINT NULL REFERENCES public.tenants(id) ON DELETE SET NULL,
  title         TEXT NOT NULL,
  description   TEXT NULL,
  status        TEXT NOT NULL,
  due_at        TIMESTAMPTZ NULL,
  completed_at  TIMESTAMPTZ NULL,
  source        TEXT NULL,
  source_ref    TEXT NULL,
  metadata      JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.kpi_tasks
  ADD CONSTRAINT kpi_tasks_status_fk
  FOREIGN KEY (status) REFERENCES public.dd_kpi_task_status(value) NOT VALID;

CREATE INDEX idx_kpi_tasks_assignee ON public.kpi_tasks (assignee_uuid, status);
CREATE INDEX idx_kpi_tasks_due      ON public.kpi_tasks (due_at);
CREATE INDEX idx_kpi_tasks_tenant   ON public.kpi_tasks (tenant_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.kpi_tasks TO authenticated;
GRANT USAGE, SELECT ON SEQUENCE public.kpi_tasks_id_seq TO authenticated;
GRANT ALL ON public.kpi_tasks TO service_role;
GRANT ALL ON SEQUENCE public.kpi_tasks_id_seq TO service_role;

ALTER TABLE public.kpi_tasks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "kpi_tasks own rows" ON public.kpi_tasks
  FOR SELECT TO authenticated
  USING (assignee_uuid = auth.uid() OR assigned_by = auth.uid());

CREATE POLICY "kpi_tasks reviewer read" ON public.kpi_tasks
  FOR SELECT TO authenticated
  USING (public.is_kpi_reviewer_safe(auth.uid()) OR public.is_super_admin_safe(auth.uid()));

CREATE POLICY "kpi_tasks superadmin manage" ON public.kpi_tasks
  FOR ALL TO authenticated
  USING (public.is_super_admin_safe(auth.uid()))
  WITH CHECK (public.is_super_admin_safe(auth.uid()));

CREATE TRIGGER trg_kpi_tasks_updated_at
  BEFORE UPDATE ON public.kpi_tasks
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- =====================================================================
-- 3. kpi_tickets — Dev ticket lifecycle (primary dev KPI table)
-- =====================================================================
CREATE TABLE public.kpi_tickets (
  id              BIGSERIAL PRIMARY KEY,
  ticket_number   TEXT NULL,
  platform        TEXT NOT NULL,
  external_id     TEXT NOT NULL,
  assignee_uuid   UUID NULL REFERENCES public.users(user_uuid) ON DELETE SET NULL,
  reporter_uuid   UUID NULL REFERENCES public.users(user_uuid) ON DELETE SET NULL,
  tenant_id       BIGINT NULL REFERENCES public.tenants(id) ON DELETE SET NULL,
  title           TEXT NOT NULL,
  priority        TEXT NULL,
  status          TEXT NOT NULL,
  opened_at       TIMESTAMPTZ NOT NULL,
  first_response_at TIMESTAMPTZ NULL,
  resolved_at     TIMESTAMPTZ NULL,
  closed_at       TIMESTAMPTZ NULL,
  reopen_count    INTEGER NOT NULL DEFAULT 0,
  metadata        JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (platform, external_id)
);
ALTER TABLE public.kpi_tickets
  ADD CONSTRAINT kpi_tickets_platform_fk FOREIGN KEY (platform) REFERENCES public.dd_kpi_ticket_platform(value) NOT VALID,
  ADD CONSTRAINT kpi_tickets_status_fk   FOREIGN KEY (status)   REFERENCES public.dd_kpi_ticket_status(value)   NOT VALID,
  ADD CONSTRAINT kpi_tickets_priority_fk FOREIGN KEY (priority) REFERENCES public.dd_kpi_ticket_priority(value) NOT VALID;

CREATE INDEX idx_kpi_tickets_assignee ON public.kpi_tickets (assignee_uuid, status);
CREATE INDEX idx_kpi_tickets_opened   ON public.kpi_tickets (opened_at DESC);
CREATE INDEX idx_kpi_tickets_tenant   ON public.kpi_tickets (tenant_id);
CREATE INDEX idx_kpi_tickets_number   ON public.kpi_tickets (ticket_number);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.kpi_tickets TO authenticated;
GRANT USAGE, SELECT ON SEQUENCE public.kpi_tickets_id_seq TO authenticated;
GRANT ALL ON public.kpi_tickets TO service_role;
GRANT ALL ON SEQUENCE public.kpi_tickets_id_seq TO service_role;

ALTER TABLE public.kpi_tickets ENABLE ROW LEVEL SECURITY;

CREATE POLICY "kpi_tickets staff read" ON public.kpi_tickets
  FOR SELECT TO authenticated
  USING (public.is_vivacity_team_safe(auth.uid()));

CREATE POLICY "kpi_tickets superadmin manage" ON public.kpi_tickets
  FOR ALL TO authenticated
  USING (public.is_super_admin_safe(auth.uid()))
  WITH CHECK (public.is_super_admin_safe(auth.uid()));

CREATE TRIGGER trg_kpi_tickets_updated_at
  BEFORE UPDATE ON public.kpi_tickets
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- =====================================================================
-- 4. kpi_ticket_comms — Dev ticket communications (comments/replies)
-- =====================================================================
CREATE TABLE public.kpi_ticket_comms (
  id            BIGSERIAL PRIMARY KEY,
  ticket_id     BIGINT NOT NULL REFERENCES public.kpi_tickets(id) ON DELETE CASCADE,
  author_uuid   UUID NULL REFERENCES public.users(user_uuid) ON DELETE SET NULL,
  comm_type     TEXT NOT NULL,
  direction     TEXT NOT NULL CHECK (direction IN ('inbound','outbound','internal')),
  external_id   TEXT NULL,
  occurred_at   TIMESTAMPTZ NOT NULL,
  body_excerpt  TEXT NULL,
  metadata      JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.kpi_ticket_comms
  ADD CONSTRAINT kpi_ticket_comms_type_fk
  FOREIGN KEY (comm_type) REFERENCES public.dd_kpi_ticket_comm_type(value) NOT VALID;

CREATE INDEX idx_kpi_ticket_comms_ticket ON public.kpi_ticket_comms (ticket_id, occurred_at);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.kpi_ticket_comms TO authenticated;
GRANT USAGE, SELECT ON SEQUENCE public.kpi_ticket_comms_id_seq TO authenticated;
GRANT ALL ON public.kpi_ticket_comms TO service_role;
GRANT ALL ON SEQUENCE public.kpi_ticket_comms_id_seq TO service_role;

ALTER TABLE public.kpi_ticket_comms ENABLE ROW LEVEL SECURITY;

CREATE POLICY "kpi_ticket_comms staff read" ON public.kpi_ticket_comms
  FOR SELECT TO authenticated
  USING (public.is_vivacity_team_safe(auth.uid()));

CREATE POLICY "kpi_ticket_comms superadmin manage" ON public.kpi_ticket_comms
  FOR ALL TO authenticated
  USING (public.is_super_admin_safe(auth.uid()))
  WITH CHECK (public.is_super_admin_safe(auth.uid()));

CREATE TRIGGER trg_kpi_ticket_comms_updated_at
  BEFORE UPDATE ON public.kpi_ticket_comms
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- =====================================================================
-- 5. kpi_reviews — Periodic KPI review header
-- =====================================================================
CREATE TABLE public.kpi_reviews (
  id            BIGSERIAL PRIMARY KEY,
  subject_uuid  UUID NOT NULL REFERENCES public.users(user_uuid) ON DELETE CASCADE,
  kpi_role      TEXT NOT NULL,
  period_type   TEXT NOT NULL,
  period_start  DATE NOT NULL,
  period_end    DATE NOT NULL,
  overall_status TEXT NULL,
  metrics       JSONB NOT NULL DEFAULT '{}'::jsonb,
  notes         TEXT NULL,
  locked_at     TIMESTAMPTZ NULL,
  created_by    UUID NULL REFERENCES public.users(user_uuid) ON DELETE SET NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (subject_uuid, period_type, period_start)
);
ALTER TABLE public.kpi_reviews
  ADD CONSTRAINT kpi_reviews_role_fk         FOREIGN KEY (kpi_role)       REFERENCES public.dd_kpi_role(value)            NOT VALID,
  ADD CONSTRAINT kpi_reviews_period_fk       FOREIGN KEY (period_type)    REFERENCES public.dd_kpi_period_type(value)     NOT VALID,
  ADD CONSTRAINT kpi_reviews_status_fk       FOREIGN KEY (overall_status) REFERENCES public.dd_kpi_overall_status(value)  NOT VALID;

CREATE INDEX idx_kpi_reviews_subject ON public.kpi_reviews (subject_uuid, period_end DESC);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.kpi_reviews TO authenticated;
GRANT USAGE, SELECT ON SEQUENCE public.kpi_reviews_id_seq TO authenticated;
GRANT ALL ON public.kpi_reviews TO service_role;
GRANT ALL ON SEQUENCE public.kpi_reviews_id_seq TO service_role;

ALTER TABLE public.kpi_reviews ENABLE ROW LEVEL SECURITY;

CREATE POLICY "kpi_reviews subject read" ON public.kpi_reviews
  FOR SELECT TO authenticated
  USING (subject_uuid = auth.uid());

CREATE POLICY "kpi_reviews reviewer read" ON public.kpi_reviews
  FOR SELECT TO authenticated
  USING (public.is_kpi_reviewer_safe(auth.uid()) OR public.is_super_admin_safe(auth.uid()));

CREATE POLICY "kpi_reviews reviewer write" ON public.kpi_reviews
  FOR INSERT TO authenticated
  WITH CHECK (public.is_kpi_reviewer_safe(auth.uid()) OR public.is_super_admin_safe(auth.uid()));

CREATE POLICY "kpi_reviews reviewer update" ON public.kpi_reviews
  FOR UPDATE TO authenticated
  USING (public.is_kpi_reviewer_safe(auth.uid()) OR public.is_super_admin_safe(auth.uid()))
  WITH CHECK (public.is_kpi_reviewer_safe(auth.uid()) OR public.is_super_admin_safe(auth.uid()));

CREATE POLICY "kpi_reviews superadmin delete" ON public.kpi_reviews
  FOR DELETE TO authenticated
  USING (public.is_super_admin_safe(auth.uid()));

CREATE TRIGGER trg_kpi_reviews_updated_at
  BEFORE UPDATE ON public.kpi_reviews
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- =====================================================================
-- 6. kpi_review_signoffs — Generic {reviewer, signoff_type} sign-offs
-- =====================================================================
CREATE TABLE public.kpi_review_signoffs (
  id                BIGSERIAL PRIMARY KEY,
  review_id         BIGINT NOT NULL REFERENCES public.kpi_reviews(id) ON DELETE CASCADE,
  reviewer_user_id  UUID NOT NULL REFERENCES public.users(user_uuid) ON DELETE CASCADE,
  signoff_type      TEXT NOT NULL,
  signed_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  comment           TEXT NULL,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (review_id, signoff_type)
);

CREATE INDEX idx_kpi_review_signoffs_reviewer ON public.kpi_review_signoffs (reviewer_user_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.kpi_review_signoffs TO authenticated;
GRANT USAGE, SELECT ON SEQUENCE public.kpi_review_signoffs_id_seq TO authenticated;
GRANT ALL ON public.kpi_review_signoffs TO service_role;
GRANT ALL ON SEQUENCE public.kpi_review_signoffs_id_seq TO service_role;

ALTER TABLE public.kpi_review_signoffs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "kpi_review_signoffs subject read" ON public.kpi_review_signoffs
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.kpi_reviews r
    WHERE r.id = kpi_review_signoffs.review_id AND r.subject_uuid = auth.uid()
  ));

CREATE POLICY "kpi_review_signoffs reviewer read" ON public.kpi_review_signoffs
  FOR SELECT TO authenticated
  USING (public.is_kpi_reviewer_safe(auth.uid()) OR public.is_super_admin_safe(auth.uid()));

CREATE POLICY "kpi_review_signoffs own write" ON public.kpi_review_signoffs
  FOR INSERT TO authenticated
  WITH CHECK (
    reviewer_user_id = auth.uid()
    AND (public.is_kpi_reviewer_safe(auth.uid()) OR public.is_super_admin_safe(auth.uid())
         OR EXISTS (SELECT 1 FROM public.kpi_reviews r WHERE r.id = review_id AND r.subject_uuid = auth.uid()))
  );

CREATE POLICY "kpi_review_signoffs superadmin manage" ON public.kpi_review_signoffs
  FOR ALL TO authenticated
  USING (public.is_super_admin_safe(auth.uid()))
  WITH CHECK (public.is_super_admin_safe(auth.uid()));

CREATE TRIGGER trg_kpi_review_signoffs_updated_at
  BEFORE UPDATE ON public.kpi_review_signoffs
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- =====================================================================
-- 7. kpi_dev_milestones — Dev KPI 6 (sprint/release milestones)
-- =====================================================================
CREATE TABLE public.kpi_dev_milestones (
  id            BIGSERIAL PRIMARY KEY,
  owner_uuid    UUID NULL REFERENCES public.users(user_uuid) ON DELETE SET NULL,
  title         TEXT NOT NULL,
  description   TEXT NULL,
  planned_date  DATE NOT NULL,
  delivered_date DATE NULL,
  status        TEXT NOT NULL,
  metadata      JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.kpi_dev_milestones
  ADD CONSTRAINT kpi_dev_milestones_status_fk
  FOREIGN KEY (status) REFERENCES public.dd_kpi_metric_status(value) NOT VALID;

CREATE INDEX idx_kpi_dev_milestones_owner   ON public.kpi_dev_milestones (owner_uuid);
CREATE INDEX idx_kpi_dev_milestones_planned ON public.kpi_dev_milestones (planned_date);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.kpi_dev_milestones TO authenticated;
GRANT USAGE, SELECT ON SEQUENCE public.kpi_dev_milestones_id_seq TO authenticated;
GRANT ALL ON public.kpi_dev_milestones TO service_role;
GRANT ALL ON SEQUENCE public.kpi_dev_milestones_id_seq TO service_role;

ALTER TABLE public.kpi_dev_milestones ENABLE ROW LEVEL SECURITY;

CREATE POLICY "kpi_dev_milestones staff read" ON public.kpi_dev_milestones
  FOR SELECT TO authenticated
  USING (public.is_vivacity_team_safe(auth.uid()));

CREATE POLICY "kpi_dev_milestones superadmin manage" ON public.kpi_dev_milestones
  FOR ALL TO authenticated
  USING (public.is_super_admin_safe(auth.uid()))
  WITH CHECK (public.is_super_admin_safe(auth.uid()));

CREATE TRIGGER trg_kpi_dev_milestones_updated_at
  BEFORE UPDATE ON public.kpi_dev_milestones
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();