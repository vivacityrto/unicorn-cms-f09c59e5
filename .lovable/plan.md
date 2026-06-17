# Phase 1 — Email Triage Schema Migration (corrected)

Three corrections applied vs. the prior plan:
1. `resolve_tenant_by_email_domain` — removed non-existent `tp.rto_email` reference.
2. `trg_email_tickets_set_response_due_at` — now fires `BEFORE INSERT OR UPDATE OF category, urgent`.
3. `fn_email_tickets_audit` — explicit `::text` cast on `entity_id` insert.

No other changes.

---

## Pre-migration verification (run manually first)

```sql
SELECT to_regclass('public.email_tickets'),
       to_regclass('public.email_ticket_counters'),
       to_regclass('public.dd_email_ticket_category'),
       to_regclass('public.dd_email_ticket_triage_status'),
       to_regclass('public.dd_email_ticket_status'),
       to_regclass('public.dd_email_ticket_sla');
-- all NULL

SELECT to_regclass('public.tenants'), to_regclass('public.users'),
       to_regclass('public.audit_events'), to_regclass('public.notification_outbox'),
       to_regproc('public.update_updated_at_column');
-- all non-NULL

SELECT extname FROM pg_extension WHERE extname IN ('pg_cron','pgcrypto');
-- both present
```

---

## Migration SQL (single file, single transaction)

```sql
-- =====================================================================
-- Email Triage Module — Phase 1 schema
-- =====================================================================

-- ---------- Step 1: dd_email_ticket_category ----------
CREATE TABLE public.dd_email_ticket_category (
  id          integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  value       text    NOT NULL UNIQUE,
  label       text    NOT NULL,
  sort_order  integer NOT NULL DEFAULT 0,
  active      boolean NOT NULL DEFAULT true
);
GRANT SELECT ON public.dd_email_ticket_category TO authenticated;
GRANT ALL    ON public.dd_email_ticket_category TO service_role;
ALTER TABLE public.dd_email_ticket_category ENABLE ROW LEVEL SECURITY;
CREATE POLICY "dd_email_ticket_category_select_auth"
  ON public.dd_email_ticket_category FOR SELECT TO authenticated USING (true);
CREATE POLICY "dd_email_ticket_category_all_superadmin"
  ON public.dd_email_ticket_category FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.users
                  WHERE user_uuid = auth.uid() AND unicorn_role = 'Super Admin'))
  WITH CHECK (EXISTS (SELECT 1 FROM public.users
                  WHERE user_uuid = auth.uid() AND unicorn_role = 'Super Admin'));
INSERT INTO public.dd_email_ticket_category (value, label, sort_order) VALUES
  ('lead',    'Lead',    10),
  ('client',  'Client',  20),
  ('tech',    'Tech',    30),
  ('billing', 'Billing', 40),
  ('general', 'General', 50);

-- ---------- Step 2: dd_email_ticket_triage_status ----------
CREATE TABLE public.dd_email_ticket_triage_status (
  id          integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  value       text    NOT NULL UNIQUE,
  label       text    NOT NULL,
  sort_order  integer NOT NULL DEFAULT 0,
  active      boolean NOT NULL DEFAULT true
);
GRANT SELECT ON public.dd_email_ticket_triage_status TO authenticated;
GRANT ALL    ON public.dd_email_ticket_triage_status TO service_role;
ALTER TABLE public.dd_email_ticket_triage_status ENABLE ROW LEVEL SECURITY;
CREATE POLICY "dd_email_ticket_triage_status_select_auth"
  ON public.dd_email_ticket_triage_status FOR SELECT TO authenticated USING (true);
CREATE POLICY "dd_email_ticket_triage_status_all_superadmin"
  ON public.dd_email_ticket_triage_status FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.users
                  WHERE user_uuid = auth.uid() AND unicorn_role = 'Super Admin'))
  WITH CHECK (EXISTS (SELECT 1 FROM public.users
                  WHERE user_uuid = auth.uid() AND unicorn_role = 'Super Admin'));
INSERT INTO public.dd_email_ticket_triage_status (value, label, sort_order) VALUES
  ('untriaged', 'Untriaged', 10),
  ('triaged',   'Triaged',   20);

-- ---------- Step 3: dd_email_ticket_status ----------
CREATE TABLE public.dd_email_ticket_status (
  id          integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  value       text    NOT NULL UNIQUE,
  label       text    NOT NULL,
  sort_order  integer NOT NULL DEFAULT 0,
  active      boolean NOT NULL DEFAULT true
);
GRANT SELECT ON public.dd_email_ticket_status TO authenticated;
GRANT ALL    ON public.dd_email_ticket_status TO service_role;
ALTER TABLE public.dd_email_ticket_status ENABLE ROW LEVEL SECURITY;
CREATE POLICY "dd_email_ticket_status_select_auth"
  ON public.dd_email_ticket_status FOR SELECT TO authenticated USING (true);
CREATE POLICY "dd_email_ticket_status_all_superadmin"
  ON public.dd_email_ticket_status FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.users
                  WHERE user_uuid = auth.uid() AND unicorn_role = 'Super Admin'))
  WITH CHECK (EXISTS (SELECT 1 FROM public.users
                  WHERE user_uuid = auth.uid() AND unicorn_role = 'Super Admin'));
INSERT INTO public.dd_email_ticket_status (value, label, sort_order) VALUES
  ('open',        'Open',         10),
  ('in_progress', 'In Progress',  20),
  ('pending',     'Pending',      30),
  ('closed',      'Closed',       40);

-- ---------- Step 4: dd_email_ticket_sla ----------
CREATE TABLE public.dd_email_ticket_sla (
  category     text    NOT NULL REFERENCES public.dd_email_ticket_category(value),
  urgent       boolean NOT NULL,
  due_minutes  integer NOT NULL,
  active       boolean NOT NULL DEFAULT true,
  PRIMARY KEY (category, urgent)
);
GRANT SELECT ON public.dd_email_ticket_sla TO authenticated;
GRANT ALL    ON public.dd_email_ticket_sla TO service_role;
ALTER TABLE public.dd_email_ticket_sla ENABLE ROW LEVEL SECURITY;
CREATE POLICY "dd_email_ticket_sla_select_auth"
  ON public.dd_email_ticket_sla FOR SELECT TO authenticated USING (true);
CREATE POLICY "dd_email_ticket_sla_all_superadmin"
  ON public.dd_email_ticket_sla FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.users
                  WHERE user_uuid = auth.uid() AND unicorn_role = 'Super Admin'))
  WITH CHECK (EXISTS (SELECT 1 FROM public.users
                  WHERE user_uuid = auth.uid() AND unicorn_role = 'Super Admin'));
INSERT INTO public.dd_email_ticket_sla (category, urgent, due_minutes) VALUES
  ('lead',    true,    60),
  ('lead',    false,  480),
  ('client',  true,    60),
  ('client',  false,  240),
  ('tech',    true,    60),
  ('tech',    false,  240),
  ('billing', true,    60),
  ('billing', false,  480),
  ('general', true,    60),
  ('general', false, 1440);

-- ---------- Step 5: email_ticket_counters ----------
CREATE TABLE public.email_ticket_counters (
  year     integer PRIMARY KEY,
  last_no  integer NOT NULL DEFAULT 0
);
GRANT ALL ON public.email_ticket_counters TO service_role;
ALTER TABLE public.email_ticket_counters ENABLE ROW LEVEL SECURITY;
-- No policies → authenticated cannot read or write (deny-all by absence)

-- ---------- Step 6: email_tickets ----------
CREATE TABLE public.email_tickets (
  id                     uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_number          text        NOT NULL UNIQUE,
  sender_name            text        NOT NULL,
  sender_email           text        NOT NULL,
  tenant_id              bigint      NULL REFERENCES public.tenants(id) ON DELETE SET NULL,
  category               text        NOT NULL DEFAULT 'general'
                                     REFERENCES public.dd_email_ticket_category(value),
  urgent                 boolean     NOT NULL DEFAULT false,
  subject                text        NOT NULL,
  body_preview           text        NULL,
  original_email_id      text        NULL UNIQUE,
  triage_status          text        NOT NULL DEFAULT 'untriaged'
                                     REFERENCES public.dd_email_ticket_triage_status(value),
  triaged_by             uuid        NULL REFERENCES public.users(user_uuid)
                                     ON UPDATE CASCADE ON DELETE SET NULL,
  triaged_at             timestamptz NULL,
  assigned_to_user_id    uuid        NULL REFERENCES public.users(user_uuid)
                                     ON UPDATE CASCADE ON DELETE SET NULL,
  assigned_at            timestamptz NULL,
  status                 text        NOT NULL DEFAULT 'open'
                                     REFERENCES public.dd_email_ticket_status(value),
  response_due_at        timestamptz NULL,
  sla_breached           boolean     NOT NULL DEFAULT false,
  ack_sent_at            timestamptz NULL,
  resolution_notes       text        NULL,
  closed_at              timestamptz NULL,
  closed_by              uuid        NULL REFERENCES public.users(user_uuid)
                                     ON UPDATE CASCADE ON DELETE SET NULL,
  received_at            timestamptz NOT NULL DEFAULT now(),
  created_at             timestamptz NOT NULL DEFAULT now(),
  updated_at             timestamptz NOT NULL DEFAULT now()
);

-- ---------- Step 7: GRANTs ----------
GRANT SELECT, UPDATE ON public.email_tickets TO authenticated;
GRANT ALL            ON public.email_tickets TO service_role;

-- ---------- Step 8: RLS ----------
ALTER TABLE public.email_tickets ENABLE ROW LEVEL SECURITY;

-- ---------- Step 9: is_email_triage_staff helper ----------
CREATE OR REPLACE FUNCTION public.is_email_triage_staff(_uid uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET search_path = ''
AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM public.users
    WHERE user_uuid = _uid
      AND unicorn_role IN ('Super Admin','Team Member','CSC','Integrator','BGT')
  );
END;
$$;
REVOKE ALL ON FUNCTION public.is_email_triage_staff(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_email_triage_staff(uuid) TO authenticated, service_role;

-- ---------- Step 10: 4 RLS policies ----------
CREATE POLICY "email_tickets_select_internal_staff"
  ON public.email_tickets FOR SELECT TO authenticated
  USING (public.is_email_triage_staff(auth.uid()));

CREATE POLICY "email_tickets_update_internal_staff"
  ON public.email_tickets FOR UPDATE TO authenticated
  USING (public.is_email_triage_staff(auth.uid()))
  WITH CHECK (public.is_email_triage_staff(auth.uid()));

CREATE POLICY "email_tickets_insert_service_role"
  ON public.email_tickets FOR INSERT TO service_role
  WITH CHECK (auth.role() = 'service_role');

CREATE POLICY "email_tickets_delete_superadmin"
  ON public.email_tickets FOR DELETE TO authenticated
  USING (EXISTS (SELECT 1 FROM public.users
                  WHERE user_uuid = auth.uid() AND unicorn_role = 'Super Admin'));

-- ---------- Step 11: Indexes ----------
CREATE INDEX idx_email_tickets_triage_received
  ON public.email_tickets (triage_status, received_at DESC);
CREATE INDEX idx_email_tickets_assigned_status_received
  ON public.email_tickets (assigned_to_user_id, status, received_at DESC);
CREATE INDEX idx_email_tickets_status_received
  ON public.email_tickets (status, received_at DESC);
CREATE INDEX idx_email_tickets_category
  ON public.email_tickets (category);
CREATE INDEX idx_email_tickets_tenant
  ON public.email_tickets (tenant_id) WHERE tenant_id IS NOT NULL;
CREATE INDEX idx_email_tickets_sla_open
  ON public.email_tickets (sla_breached) WHERE sla_breached = false;
CREATE INDEX idx_email_tickets_due_open
  ON public.email_tickets (response_due_at)
  WHERE sla_breached = false AND status IN ('open','in_progress','pending');

-- ---------- Step 12: fn_email_tickets_set_ticket_number ----------
CREATE OR REPLACE FUNCTION public.fn_email_tickets_set_ticket_number()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_year integer := extract(year from pg_catalog.now())::int;
  v_no   integer;
BEGIN
  IF NEW.ticket_number IS NOT NULL AND NEW.ticket_number <> '' THEN
    RETURN NEW;
  END IF;

  INSERT INTO public.email_ticket_counters (year, last_no)
  VALUES (v_year, 1)
  ON CONFLICT (year) DO UPDATE
    SET last_no = public.email_ticket_counters.last_no + 1
  RETURNING last_no INTO v_no;

  NEW.ticket_number := 'VIV-' || v_year::text || '-' || lpad(v_no::text, 4, '0');
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.fn_email_tickets_set_ticket_number() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.fn_email_tickets_set_ticket_number() TO service_role;

-- ---------- Step 13: fn_email_tickets_set_response_due_at ----------
CREATE OR REPLACE FUNCTION public.fn_email_tickets_set_response_due_at()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_minutes integer;
BEGIN
  SELECT due_minutes INTO v_minutes
  FROM public.dd_email_ticket_sla
  WHERE category = NEW.category AND urgent = NEW.urgent;

  IF v_minutes IS NULL THEN
    RAISE EXCEPTION
      'No SLA configured for category=% urgent=%', NEW.category, NEW.urgent
      USING ERRCODE = 'foreign_key_violation';
  END IF;

  NEW.response_due_at := NEW.received_at + make_interval(mins => v_minutes);
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.fn_email_tickets_set_response_due_at() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.fn_email_tickets_set_response_due_at() TO service_role;

-- ---------- Step 14: fn_email_tickets_enforce_closed_consistency ----------
CREATE OR REPLACE FUNCTION public.fn_email_tickets_enforce_closed_consistency()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF NEW.status = 'closed' THEN
    IF NEW.closed_at IS NULL THEN NEW.closed_at := pg_catalog.now(); END IF;
    IF NEW.closed_by IS NULL THEN NEW.closed_by := auth.uid(); END IF;
  ELSE
    NEW.closed_at := NULL;
    NEW.closed_by := NULL;
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.fn_email_tickets_enforce_closed_consistency() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.fn_email_tickets_enforce_closed_consistency()
  TO authenticated, service_role;

-- ---------- Step 15: fn_email_tickets_audit ----------
-- audit_events column is "entity" (not "entity_type"); entity_id cast to text per spec.
CREATE OR REPLACE FUNCTION public.fn_email_tickets_audit()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_action text;
  v_details jsonb := '{}'::jsonb;
  v_entity_id uuid;
BEGIN
  IF TG_OP = 'INSERT' THEN
    v_action := 'created';
    v_entity_id := NEW.id;
    v_details := jsonb_build_object(
      'ticket_number', NEW.ticket_number,
      'category',      NEW.category,
      'urgent',        NEW.urgent,
      'status',        NEW.status,
      'triage_status', NEW.triage_status
    );
  ELSIF TG_OP = 'UPDATE' THEN
    v_entity_id := NEW.id;
    IF NEW.status = 'closed' AND OLD.status IS DISTINCT FROM 'closed' THEN
      v_action := 'closed';
    ELSIF OLD.triage_status = 'untriaged' AND NEW.triage_status = 'triaged' THEN
      v_action := 'triaged';
    ELSIF OLD.assigned_to_user_id IS DISTINCT FROM NEW.assigned_to_user_id THEN
      v_action := 'assigned';
    ELSIF OLD.status IS DISTINCT FROM NEW.status THEN
      v_action := 'status_changed';
    ELSE
      v_action := 'updated';
    END IF;
    v_details := jsonb_build_object(
      'old_status',        OLD.status,
      'new_status',        NEW.status,
      'old_triage_status', OLD.triage_status,
      'new_triage_status', NEW.triage_status,
      'old_assigned_to',   OLD.assigned_to_user_id,
      'new_assigned_to',   NEW.assigned_to_user_id,
      'old_category',      OLD.category,
      'new_category',      NEW.category,
      'old_urgent',        OLD.urgent,
      'new_urgent',        NEW.urgent
    );
  ELSIF TG_OP = 'DELETE' THEN
    v_action := 'deleted';
    v_entity_id := OLD.id;
    v_details := jsonb_build_object('ticket_number', OLD.ticket_number);
  END IF;

  INSERT INTO public.audit_events (entity, entity_id, action, user_id, details)
  VALUES ('email_ticket', v_entity_id::text, v_action, auth.uid(), v_details);

  RETURN COALESCE(NEW, OLD);
END;
$$;
REVOKE ALL ON FUNCTION public.fn_email_tickets_audit() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.fn_email_tickets_audit() TO authenticated, service_role;

-- ---------- Step 16: resolve_tenant_by_email_domain ----------
-- No dedicated "domain" column; matches against tenant_profile.primary_contact_email and tenants.website.
CREATE OR REPLACE FUNCTION public.resolve_tenant_by_email_domain(_email text)
RETURNS bigint
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET search_path = ''
AS $$
DECLARE
  v_domain text;
  v_tenant_id bigint;
BEGIN
  IF _email IS NULL OR position('@' in _email) = 0 THEN RETURN NULL; END IF;
  v_domain := lower(split_part(_email, '@', 2));
  IF v_domain = '' THEN RETURN NULL; END IF;

  -- 1. Match against tenant_profile.primary_contact_email
  SELECT tp.tenant_id INTO v_tenant_id
  FROM public.tenant_profile tp
  WHERE lower(split_part(coalesce(tp.primary_contact_email, ''), '@', 2)) = v_domain
  ORDER BY tp.tenant_id
  LIMIT 1;
  IF v_tenant_id IS NOT NULL THEN RETURN v_tenant_id; END IF;

  -- 2. Match against tenants.website host (strip protocol + path)
  SELECT t.id INTO v_tenant_id
  FROM public.tenants t
  WHERE t.website IS NOT NULL
    AND lower(regexp_replace(regexp_replace(t.website, '^https?://', ''), '/.*$', ''))
        LIKE '%' || v_domain
  ORDER BY t.id
  LIMIT 1;

  RETURN v_tenant_id;
END;
$$;
REVOKE ALL ON FUNCTION public.resolve_tenant_by_email_domain(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.resolve_tenant_by_email_domain(text) TO service_role;

-- ---------- Step 17: Bind triggers ----------
CREATE TRIGGER trg_email_tickets_set_updated_at
  BEFORE UPDATE ON public.email_tickets
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER trg_email_tickets_set_ticket_number
  BEFORE INSERT ON public.email_tickets
  FOR EACH ROW EXECUTE FUNCTION public.fn_email_tickets_set_ticket_number();

CREATE TRIGGER trg_email_tickets_set_response_due_at
  BEFORE INSERT OR UPDATE OF category, urgent ON public.email_tickets
  FOR EACH ROW EXECUTE FUNCTION public.fn_email_tickets_set_response_due_at();

CREATE TRIGGER trg_email_tickets_enforce_closed
  BEFORE INSERT OR UPDATE ON public.email_tickets
  FOR EACH ROW EXECUTE FUNCTION public.fn_email_tickets_enforce_closed_consistency();

CREATE TRIGGER trg_email_tickets_audit
  AFTER INSERT OR UPDATE OR DELETE ON public.email_tickets
  FOR EACH ROW EXECUTE FUNCTION public.fn_email_tickets_audit();

-- ---------- Step 19: SLA breach cron function (defined before scheduling) ----------
CREATE OR REPLACE FUNCTION public.fn_email_tickets_flag_sla_breaches()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  UPDATE public.email_tickets
     SET sla_breached = true
   WHERE sla_breached = false
     AND status IN ('open','in_progress','pending')
     AND response_due_at < pg_catalog.now();
END;
$$;
REVOKE ALL ON FUNCTION public.fn_email_tickets_flag_sla_breaches() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.fn_email_tickets_flag_sla_breaches() TO service_role;

-- ---------- Step 18: pg_cron schedule ----------
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'email_tickets_flag_sla_breaches') THEN
    PERFORM cron.unschedule('email_tickets_flag_sla_breaches');
  END IF;
END$$;
SELECT cron.schedule(
  'email_tickets_flag_sla_breaches',
  '*/5 * * * *',
  $cron$ SELECT public.fn_email_tickets_flag_sla_breaches(); $cron$
);

-- ---------- Step 20: Realtime ----------
ALTER PUBLICATION supabase_realtime ADD TABLE public.email_tickets;

-- =====================================================================
-- Post-migration verification (run manually):
-- SELECT count(*) FROM pg_constraint WHERE conrelid='public.email_tickets'::regclass AND contype='f'; -- expect 5
-- SELECT count(*) FROM pg_indexes WHERE schemaname='public' AND tablename='email_tickets';            -- expect 9+
-- SELECT count(*) FROM pg_policies WHERE schemaname='public' AND tablename='email_tickets';           -- expect 4
-- SELECT relrowsecurity FROM pg_class WHERE oid='public.email_tickets'::regclass;                     -- expect true
-- SELECT count(*) FROM public.dd_email_ticket_sla;                                                    -- expect 10
-- SELECT jobname FROM cron.job WHERE jobname='email_tickets_flag_sla_breaches';                       -- expect 1 row
-- =====================================================================
```

Approve to apply, or request further edits.
