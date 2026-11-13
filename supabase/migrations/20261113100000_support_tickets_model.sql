-- Support tickets: one streamlined model for tickets, replies and attachments.
-- Replaces suggest_items (+ six dd_suggest_* lookups, 39 columns) and the Help
-- Centre "support" help_threads channel. ADDITIVE ONLY: nothing existing is
-- altered or dropped here (the backfill and cut-over are separate migrations).
--
-- Design: docs/kb/reference/support-tickets-overhaul/ (and the audit entry
-- docs/audit-log/entries/2026-11-13-support-tickets-model.md).
-- migration-target-project: yxkgdalkbrriasiyyrwk
--
-- Rollback: supabase/migrations/rollback/20261113100000_support_tickets_model.down.sql

-- ---------------------------------------------------------------------------
-- 1. Tables
-- ---------------------------------------------------------------------------

CREATE TABLE public.support_tickets (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_number    bigint GENERATED ALWAYS AS IDENTITY UNIQUE,
  product          text   NOT NULL DEFAULT 'unicorn'
                     CONSTRAINT support_tickets_product_chk CHECK (product IN ('unicorn', 'complyhub_ai', 'company')),
  tenant_id        bigint NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  reporter_id      uuid   NOT NULL REFERENCES public.users(user_uuid) ON UPDATE CASCADE,
  type             text   NOT NULL DEFAULT 'other'
                     CONSTRAINT support_tickets_type_chk CHECK (type IN ('bug', 'request', 'question', 'other')),
  status           text   NOT NULL DEFAULT 'new'
                     CONSTRAINT support_tickets_status_chk CHECK (status IN ('new', 'in_progress', 'waiting', 'resolved', 'closed')),
  urgency          text   NOT NULL DEFAULT 'medium'
                     CONSTRAINT support_tickets_urgency_chk CHECK (urgency IN ('low', 'medium', 'high', 'critical')),
  title            text   NOT NULL
                     CONSTRAINT support_tickets_title_chk CHECK (char_length(btrim(title)) BETWEEN 1 AND 300),
  assignee_id      uuid   REFERENCES public.users(user_uuid) ON UPDATE CASCADE ON DELETE SET NULL,
  source_url       text   CONSTRAINT support_tickets_source_url_chk CHECK (char_length(source_url) <= 500),
  external_ref     text   CONSTRAINT support_tickets_external_ref_chk CHECK (char_length(external_ref) <= 200),
  ai_state         text   NOT NULL DEFAULT 'none'
                     CONSTRAINT support_tickets_ai_state_chk CHECK (ai_state IN ('none', 'pending', 'drafting', 'drafted', 'failed', 'reviewed')),
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now(),
  resolved_at      timestamptz,
  last_activity_at timestamptz NOT NULL DEFAULT now(),
  deleted_at       timestamptz,
  -- ComplyHub and company-wide issues are staff-raised under Vivacity's own
  -- tenant; no ComplyHub (or any other) customer tenant may attach to them.
  CONSTRAINT support_tickets_product_tenant_chk CHECK (product = 'unicorn' OR tenant_id = 6372)
);

COMMENT ON TABLE public.support_tickets IS
  'Company-wide tickets (Unicorn, ComplyHub, company). Created only through public.create_support_ticket(); clients cannot write this table directly.';
COMMENT ON COLUMN public.support_tickets.external_ref IS
  'Link or reference to a record elsewhere (for example a ComplyHub-side issue). Never customer or tenant data.';
COMMENT ON COLUMN public.support_tickets.ai_state IS
  'pending/drafting/drafted/failed/reviewed: whether title, type and urgency are an unreviewed AI draft (support-ticket-ai-draft).';

CREATE UNIQUE INDEX support_tickets_product_external_ref_uq
  ON public.support_tickets (product, external_ref) WHERE external_ref IS NOT NULL;
CREATE INDEX support_tickets_status_assignee_idx ON public.support_tickets (status, assignee_id);
CREATE INDEX support_tickets_tenant_idx          ON public.support_tickets (tenant_id);
CREATE INDEX support_tickets_reporter_idx        ON public.support_tickets (reporter_id);
CREATE INDEX support_tickets_activity_idx        ON public.support_tickets (last_activity_at DESC);

CREATE TABLE public.support_ticket_messages (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id  uuid NOT NULL REFERENCES public.support_tickets(id) ON DELETE CASCADE,
  author_id  uuid REFERENCES public.users(user_uuid) ON UPDATE CASCADE ON DELETE SET NULL,
  kind       text NOT NULL
               CONSTRAINT support_ticket_messages_kind_chk CHECK (kind IN ('reply', 'event', 'ai_draft')),
  staff_only boolean NOT NULL DEFAULT false,
  body       text NOT NULL
               CONSTRAINT support_ticket_messages_body_chk CHECK (char_length(body) BETWEEN 1 AND 50000),
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT support_ticket_messages_ai_staff_only_chk CHECK (kind <> 'ai_draft' OR staff_only)
);

COMMENT ON TABLE public.support_ticket_messages IS
  'Immutable ticket thread. reply = written by a person; event = written by trigger or RPC only; ai_draft = AI summary, always staff-only. staff_only rows are never visible to the reporter.';

CREATE INDEX support_ticket_messages_ticket_idx ON public.support_ticket_messages (ticket_id, created_at);

CREATE TABLE public.support_ticket_attachments (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id    uuid NOT NULL REFERENCES public.support_tickets(id) ON DELETE CASCADE,
  message_id   uuid REFERENCES public.support_ticket_messages(id) ON DELETE CASCADE,
  bucket       text NOT NULL DEFAULT 'ticket-files'
                 CONSTRAINT support_ticket_attachments_bucket_chk CHECK (bucket IN ('ticket-files', 'suggest-attachments', 'support-attachments')),
  storage_path text NOT NULL,
  file_name    text NOT NULL,
  mime_type    text,
  size_bytes   bigint,
  uploaded_by  uuid REFERENCES public.users(user_uuid) ON UPDATE CASCADE ON DELETE SET NULL,
  created_at   timestamptz NOT NULL DEFAULT now()
);

COMMENT ON COLUMN public.support_ticket_attachments.bucket IS
  'ticket-files for new uploads. suggest-attachments / support-attachments for migrated files, which stay where they are until the retire step.';

CREATE UNIQUE INDEX support_ticket_attachments_object_uq ON public.support_ticket_attachments (bucket, storage_path);
CREATE INDEX support_ticket_attachments_ticket_idx ON public.support_ticket_attachments (ticket_id);

-- Migration bookkeeping: rollback key and audit trail (staff read-only).
CREATE TABLE public.support_ticket_migration_map (
  legacy_table text NOT NULL,
  legacy_id    uuid NOT NULL,
  ticket_id    uuid NOT NULL,
  migrated_at  timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (legacy_table, legacy_id)
);

CREATE TABLE public.support_ticket_migration_checks (
  id           bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  run_at       timestamptz NOT NULL DEFAULT now(),
  check_name   text NOT NULL,
  legacy_value text,
  new_value    text,
  ok           boolean NOT NULL
);

-- ---------------------------------------------------------------------------
-- 2. Helper functions (all SECURITY DEFINER, empty search_path, schema-qualified)
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.support_user_academy_only(p_tenant_id bigint, p_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $function$
  SELECT EXISTS (
    SELECT 1 FROM public.tenant_users tu
    WHERE tu.user_id = p_user_id
      AND tu.tenant_id = p_tenant_id
      AND tu.access_scope = 'academy_only'
  );
$function$;

CREATE OR REPLACE FUNCTION public.can_view_support_ticket(p_ticket_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $function$
  SELECT
    public.is_vivacity_team_safe(auth.uid())
    OR EXISTS (
      SELECT 1 FROM public.support_tickets t
      WHERE t.id = p_ticket_id
        AND t.deleted_at IS NULL
        AND t.product = 'unicorn'
        AND t.reporter_id = auth.uid()
        AND public.has_tenant_access_safe(t.tenant_id, auth.uid())
    );
$function$;

-- Reads of attachment files in any of the three buckets. A reporter never gets
-- a file that hangs off a staff-only message.
CREATE OR REPLACE FUNCTION public.can_read_support_file(p_bucket text, p_path text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $function$
  SELECT
    public.is_vivacity_team_safe(auth.uid())
    OR EXISTS (
      SELECT 1
      FROM public.support_ticket_attachments a
      JOIN public.support_tickets t ON t.id = a.ticket_id
      LEFT JOIN public.support_ticket_messages m ON m.id = a.message_id
      WHERE a.bucket = p_bucket
        AND a.storage_path = p_path
        AND t.deleted_at IS NULL
        AND t.product = 'unicorn'
        AND t.reporter_id = auth.uid()
        AND public.has_tenant_access_safe(t.tenant_id, auth.uid())
        AND (m.id IS NULL OR NOT m.staff_only)
    );
$function$;

CREATE OR REPLACE FUNCTION public.support_notify(
  p_user_id uuid, p_tenant_id bigint, p_type text, p_title text, p_message text,
  p_link text, p_dedupe_key text, p_actor uuid, p_ticket_id uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
BEGIN
  IF p_user_id IS NULL THEN RETURN; END IF;
  INSERT INTO public.user_notifications
    (user_id, tenant_id, type, title, message, link, dedupe_key, created_by, source_id)
  VALUES
    (p_user_id, p_tenant_id, p_type, p_title, p_message, p_link, p_dedupe_key, p_actor, p_ticket_id::text)
  ON CONFLICT (dedupe_key) DO NOTHING;
END;
$function$;

-- Triage audience for a new or reporter-replied ticket: the assignee if there
-- is one, else Super Admin / Team Leader / Team Member (the audience the old
-- notify-suggestion-submitted function used).
CREATE OR REPLACE FUNCTION public.support_triage_recipients(p_assignee uuid, p_exclude uuid)
RETURNS TABLE (user_id uuid)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $function$
  SELECT u.user_uuid
  FROM public.users u
  WHERE u.user_uuid IS DISTINCT FROM p_exclude
    AND COALESCE(u.disabled, false) = false
    AND COALESCE(u.archived, false) = false
    AND (
      (p_assignee IS NOT NULL AND u.user_uuid = p_assignee)
      OR (p_assignee IS NULL
          AND COALESCE(u.is_vivacity_internal, false) = true
          AND u.unicorn_role IN ('Super Admin', 'Team Leader', 'Team Member'))
    );
$function$;

CREATE OR REPLACE FUNCTION public.support_status_label(p_status text)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path = ''
AS $function$
  SELECT CASE p_status
    WHEN 'new' THEN 'New'
    WHEN 'in_progress' THEN 'In progress'
    WHEN 'waiting' THEN 'Waiting on reporter'
    WHEN 'resolved' THEN 'Resolved'
    WHEN 'closed' THEN 'Closed'
    ELSE p_status
  END;
$function$;

-- ---------------------------------------------------------------------------
-- 3. Ticket creation RPC: the only way a ticket comes into existence.
--    One transaction: ticket (default fields), the reporter's wording verbatim
--    as message 1, a staff-only diagnostics note, and triage notifications.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.create_support_ticket(
  p_subject     text,
  p_body        text,
  p_page_path   text  DEFAULT NULL,
  p_diagnostics jsonb DEFAULT NULL,
  p_product     text  DEFAULT 'unicorn',
  p_tenant_id   bigint DEFAULT NULL,
  p_type        text  DEFAULT NULL,
  p_urgency     text  DEFAULT NULL,
  p_external_ref text DEFAULT NULL
)
RETURNS TABLE (id uuid, ticket_number bigint)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_uid     uuid := auth.uid();
  v_staff   boolean;
  v_tenant  bigint;
  v_title   text;
  v_type    text;
  v_urgency text;
  v_state   text;
  v_id      uuid;
  v_num     bigint;
  v_diag    text;
  v_name    text;
  r         record;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Not signed in' USING ERRCODE = '42501';
  END IF;
  v_staff := public.is_vivacity_team_safe(v_uid);

  IF p_body IS NULL OR btrim(p_body) = '' OR char_length(p_body) > 10000 THEN
    RAISE EXCEPTION 'Message must be between 1 and 10000 characters' USING ERRCODE = '22023';
  END IF;
  IF p_product IS NULL OR p_product NOT IN ('unicorn', 'complyhub_ai', 'company') THEN
    RAISE EXCEPTION 'Unknown product' USING ERRCODE = '22023';
  END IF;
  IF p_type IS NOT NULL AND p_type NOT IN ('bug', 'request', 'question', 'other') THEN
    RAISE EXCEPTION 'Unknown type' USING ERRCODE = '22023';
  END IF;
  IF p_urgency IS NOT NULL AND p_urgency NOT IN ('low', 'medium', 'high', 'critical') THEN
    RAISE EXCEPTION 'Unknown urgency' USING ERRCODE = '22023';
  END IF;
  IF p_external_ref IS NOT NULL AND char_length(p_external_ref) > 200 THEN
    RAISE EXCEPTION 'external_ref too long' USING ERRCODE = '22023';
  END IF;

  IF v_staff THEN
    v_tenant := COALESCE(p_tenant_id, 6372);
    IF p_product <> 'unicorn' AND v_tenant <> 6372 THEN
      RAISE EXCEPTION 'ComplyHub and company tickets use the Vivacity tenant only' USING ERRCODE = '22023';
    END IF;
    v_type    := COALESCE(p_type, 'other');
    v_urgency := COALESCE(p_urgency, 'medium');
    v_state   := 'none';
  ELSE
    -- Clients: Unicorn tickets only, own tenant, no classification fields
    -- (the AI draft or staff set those), never academy-only users.
    IF p_product <> 'unicorn' THEN
      RAISE EXCEPTION 'Not permitted' USING ERRCODE = '42501';
    END IF;
    IF p_type IS NOT NULL OR p_urgency IS NOT NULL OR p_external_ref IS NOT NULL THEN
      RAISE EXCEPTION 'Not permitted' USING ERRCODE = '42501';
    END IF;
    v_tenant := p_tenant_id;
    IF v_tenant IS NULL THEN
      SELECT u.tenant_id INTO v_tenant FROM public.users u WHERE u.user_uuid = v_uid;
    END IF;
    IF v_tenant IS NULL OR NOT public.has_tenant_access_safe(v_tenant, v_uid) THEN
      RAISE EXCEPTION 'No access to this organisation' USING ERRCODE = '42501';
    END IF;
    IF public.support_user_academy_only(v_tenant, v_uid) THEN
      RAISE EXCEPTION 'Support tickets are not available on your plan' USING ERRCODE = '42501';
    END IF;
    v_type    := 'other';
    v_urgency := 'medium';
    v_state   := 'pending';
  END IF;

  v_title := NULLIF(btrim(COALESCE(p_subject, '')), '');
  IF v_title IS NULL THEN
    v_title := left(btrim(regexp_replace(p_body, '\s+', ' ', 'g')), 80);
  END IF;
  v_title := left(v_title, 300);

  INSERT INTO public.support_tickets
    (product, tenant_id, reporter_id, type, status, urgency, title, source_url, external_ref, ai_state)
  VALUES
    (p_product, v_tenant, v_uid, v_type, 'new', v_urgency, v_title,
     left(p_page_path, 500), NULLIF(btrim(COALESCE(p_external_ref, '')), ''), v_state)
  RETURNING support_tickets.id, support_tickets.ticket_number INTO v_id, v_num;

  -- Message 1: the reporter's own wording, verbatim and immutable.
  INSERT INTO public.support_ticket_messages (ticket_id, author_id, kind, staff_only, body)
  VALUES (v_id, v_uid, 'reply', false, p_body);

  -- Staff-only diagnostics, from an allowlist of keys only.
  IF p_diagnostics IS NOT NULL AND jsonb_typeof(p_diagnostics) = 'object' THEN
    v_diag := concat_ws(E'\n',
      CASE WHEN p_diagnostics ->> 'page_path' IS NOT NULL THEN 'Page: ' || left(p_diagnostics ->> 'page_path', 300) END,
      CASE WHEN p_diagnostics ->> 'browser'   IS NOT NULL THEN 'Browser: ' || left(p_diagnostics ->> 'browser', 60) END,
      CASE WHEN p_diagnostics ->> 'os'        IS NOT NULL THEN 'Operating system: ' || left(p_diagnostics ->> 'os', 60) END,
      CASE WHEN p_diagnostics ->> 'screen'    IS NOT NULL THEN 'Screen: ' || left(p_diagnostics ->> 'screen', 30) END
    );
    IF v_diag IS NOT NULL AND v_diag <> '' THEN
      INSERT INTO public.support_ticket_messages (ticket_id, author_id, kind, staff_only, body)
      VALUES (v_id, NULL, 'event', true, 'Diagnostics captured at submission' || E'\n' || v_diag);
    END IF;
  END IF;

  -- Triage notifications (never to the submitter).
  SELECT COALESCE(NULLIF(btrim(COALESCE(u.first_name, '') || ' ' || COALESCE(u.last_name, '')), ''), 'A user')
    INTO v_name FROM public.users u WHERE u.user_uuid = v_uid;
  FOR r IN SELECT user_id FROM public.support_triage_recipients(NULL, v_uid) LOOP
    PERFORM public.support_notify(
      r.user_id, v_tenant, 'ticket_submitted',
      'New ticket ST-' || v_num,
      v_name || ' submitted: "' || left(v_title, 120) || '"',
      '/support-tickets/' || v_id,
      'ticket_submitted:' || v_id || ':' || r.user_id,
      v_uid, v_id);
  END LOOP;

  RETURN QUERY SELECT v_id, v_num;
END;
$function$;

-- ---------------------------------------------------------------------------
-- 4. Triggers (no INSERT trigger on tickets: creation is RPC-only)
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.support_tickets_before_update()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
BEGIN
  IF NEW.id IS DISTINCT FROM OLD.id
     OR NEW.ticket_number IS DISTINCT FROM OLD.ticket_number
     OR NEW.tenant_id IS DISTINCT FROM OLD.tenant_id
     OR NEW.reporter_id IS DISTINCT FROM OLD.reporter_id
     OR NEW.created_at IS DISTINCT FROM OLD.created_at THEN
    RAISE EXCEPTION 'id, ticket_number, tenant_id, reporter_id and created_at cannot be changed' USING ERRCODE = '42501';
  END IF;

  IF NEW.assignee_id IS NOT NULL
     AND NEW.assignee_id IS DISTINCT FROM OLD.assignee_id
     AND NOT public.is_vivacity_team_safe(NEW.assignee_id) THEN
    RAISE EXCEPTION 'A ticket can only be assigned to active Vivacity staff' USING ERRCODE = '22023';
  END IF;

  IF NEW.deleted_at IS DISTINCT FROM OLD.deleted_at
     AND auth.uid() IS NOT NULL
     AND NOT public.is_super_admin_safe(auth.uid()) THEN
    RAISE EXCEPTION 'Only a Super Admin can delete or restore a ticket' USING ERRCODE = '42501';
  END IF;

  -- resolved_at follows the status.
  IF NEW.status IN ('resolved', 'closed') THEN
    IF OLD.status NOT IN ('resolved', 'closed') OR NEW.resolved_at IS NULL THEN
      NEW.resolved_at := now();
    END IF;
  ELSE
    NEW.resolved_at := NULL;
  END IF;

  -- First staff edit of an AI-drafted classification marks it reviewed.
  IF OLD.ai_state = 'drafted' AND NEW.ai_state = 'drafted'
     AND auth.uid() IS NOT NULL
     AND public.is_vivacity_team_safe(auth.uid())
     AND (NEW.title IS DISTINCT FROM OLD.title
          OR NEW.type IS DISTINCT FROM OLD.type
          OR NEW.urgency IS DISTINCT FROM OLD.urgency) THEN
    NEW.ai_state := 'reviewed';
  END IF;

  IF NEW.status IS DISTINCT FROM OLD.status
     OR NEW.assignee_id IS DISTINCT FROM OLD.assignee_id
     OR NEW.urgency IS DISTINCT FROM OLD.urgency
     OR NEW.type IS DISTINCT FROM OLD.type THEN
    NEW.last_activity_at := now();
  END IF;

  NEW.updated_at := now();
  RETURN NEW;
END;
$function$;

CREATE TRIGGER support_tickets_before_update
  BEFORE UPDATE ON public.support_tickets
  FOR EACH ROW EXECUTE FUNCTION public.support_tickets_before_update();

CREATE OR REPLACE FUNCTION public.support_tickets_after_update()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_actor uuid := auth.uid();
  v_name  text;
  v_link  text;
BEGIN
  IF NEW.status IS DISTINCT FROM OLD.status THEN
    INSERT INTO public.support_ticket_messages (ticket_id, author_id, kind, staff_only, body)
    VALUES (NEW.id, v_actor, 'event', false, 'Status changed to ' || public.support_status_label(NEW.status));

    IF NEW.status IN ('resolved', 'closed') AND NEW.reporter_id IS DISTINCT FROM v_actor THEN
      v_link := CASE WHEN public.is_vivacity_team_safe(NEW.reporter_id)
                     THEN '/support-tickets/' || NEW.id
                     ELSE '/client/support-tickets/' || NEW.id END;
      PERFORM public.support_notify(
        NEW.reporter_id, NEW.tenant_id, 'ticket_resolved',
        CASE NEW.status WHEN 'resolved' THEN 'Your ticket was resolved' ELSE 'Your ticket was closed' END,
        'ST-' || NEW.ticket_number || ': ' || left(NEW.title, 120),
        v_link,
        'ticket_resolved:' || NEW.id || ':' || NEW.status || ':' || floor(extract(epoch FROM now()) * 1000)::bigint,
        v_actor, NEW.id);
    END IF;
  END IF;

  IF NEW.assignee_id IS DISTINCT FROM OLD.assignee_id THEN
    SELECT COALESCE(NULLIF(btrim(COALESCE(u.first_name, '') || ' ' || COALESCE(u.last_name, '')), ''), 'a team member')
      INTO v_name FROM public.users u WHERE u.user_uuid = NEW.assignee_id;
    INSERT INTO public.support_ticket_messages (ticket_id, author_id, kind, staff_only, body)
    VALUES (NEW.id, v_actor, 'event', true,
            CASE WHEN NEW.assignee_id IS NULL THEN 'Unassigned' ELSE 'Assigned to ' || v_name END);

    IF NEW.assignee_id IS NOT NULL AND NEW.assignee_id IS DISTINCT FROM v_actor THEN
      PERFORM public.support_notify(
        NEW.assignee_id, NEW.tenant_id, 'ticket_assigned',
        'Ticket assigned to you',
        'ST-' || NEW.ticket_number || ': ' || left(NEW.title, 120),
        '/support-tickets/' || NEW.id,
        'ticket_assigned:' || NEW.id || ':' || NEW.assignee_id || ':' || floor(extract(epoch FROM now()) * 1000)::bigint,
        v_actor, NEW.id);
    END IF;
  END IF;
  RETURN NEW;
END;
$function$;

CREATE TRIGGER support_tickets_after_update
  AFTER UPDATE ON public.support_tickets
  FOR EACH ROW EXECUTE FUNCTION public.support_tickets_after_update();

CREATE OR REPLACE FUNCTION public.support_ticket_messages_after_insert()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  t        public.support_tickets;
  r        record;
  v_link   text;
BEGIN
  IF NEW.kind <> 'reply' THEN
    RETURN NEW;
  END IF;

  SELECT * INTO t FROM public.support_tickets WHERE id = NEW.ticket_id;
  IF NOT FOUND THEN
    RETURN NEW;
  END IF;

  -- The first reply is the ticket's own wording; create_support_ticket()
  -- already sent the "new ticket" notification, so do nothing here.
  IF NOT EXISTS (
    SELECT 1 FROM public.support_ticket_messages m
    WHERE m.ticket_id = NEW.ticket_id AND m.kind = 'reply' AND m.id <> NEW.id
  ) THEN
    RETURN NEW;
  END IF;

  -- A public reply from the reporter reopens a waiting, resolved or closed
  -- ticket. Done here, as definer, because clients have no UPDATE right.
  IF NEW.author_id IS NOT DISTINCT FROM t.reporter_id
     AND NOT NEW.staff_only
     AND t.status IN ('waiting', 'resolved', 'closed') THEN
    UPDATE public.support_tickets
       SET status = 'in_progress', last_activity_at = now()
     WHERE id = t.id;
  ELSE
    UPDATE public.support_tickets SET last_activity_at = now() WHERE id = t.id;
  END IF;

  IF NEW.author_id IS NOT DISTINCT FROM t.reporter_id THEN
    FOR r IN SELECT user_id FROM public.support_triage_recipients(t.assignee_id, NEW.author_id) LOOP
      PERFORM public.support_notify(
        r.user_id, t.tenant_id, 'ticket_reply',
        'New reply on ST-' || t.ticket_number,
        left(t.title, 120),
        '/support-tickets/' || t.id,
        'ticket_reply:' || NEW.id || ':' || r.user_id,
        NEW.author_id, t.id);
    END LOOP;
  ELSIF NOT NEW.staff_only THEN
    v_link := CASE WHEN public.is_vivacity_team_safe(t.reporter_id)
                   THEN '/support-tickets/' || t.id
                   ELSE '/client/support-tickets/' || t.id END;
    PERFORM public.support_notify(
      t.reporter_id, t.tenant_id, 'ticket_reply',
      'Reply on your ticket ST-' || t.ticket_number,
      left(t.title, 120),
      v_link,
      'ticket_reply:' || NEW.id || ':' || t.reporter_id,
      NEW.author_id, t.id);
  END IF;
  RETURN NEW;
END;
$function$;

CREATE TRIGGER support_ticket_messages_after_insert
  AFTER INSERT ON public.support_ticket_messages
  FOR EACH ROW EXECUTE FUNCTION public.support_ticket_messages_after_insert();

-- ---------------------------------------------------------------------------
-- 5. Function grants (revoke the PUBLIC default; grant only what is needed)
-- ---------------------------------------------------------------------------

REVOKE ALL ON FUNCTION public.support_user_academy_only(bigint, uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.support_notify(uuid, bigint, text, text, text, text, text, uuid, uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.support_triage_recipients(uuid, uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.support_status_label(text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.support_tickets_before_update() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.support_tickets_after_update() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.support_ticket_messages_after_insert() FROM PUBLIC, anon, authenticated;

REVOKE ALL ON FUNCTION public.can_view_support_ticket(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.can_read_support_file(text, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.create_support_ticket(text, text, text, jsonb, text, bigint, text, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.can_view_support_ticket(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.can_read_support_file(text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.support_status_label(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.create_support_ticket(text, text, text, jsonb, text, bigint, text, text, text) TO authenticated;

-- ---------------------------------------------------------------------------
-- 6. RLS. Table-level grants (not per-column), plus policies.
-- ---------------------------------------------------------------------------

ALTER TABLE public.support_tickets                ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.support_ticket_messages        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.support_ticket_attachments     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.support_ticket_migration_map   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.support_ticket_migration_checks ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.support_tickets, public.support_ticket_messages, public.support_ticket_attachments,
              public.support_ticket_migration_map, public.support_ticket_migration_checks
  FROM PUBLIC, anon, authenticated;

GRANT SELECT, UPDATE         ON public.support_tickets            TO authenticated;
GRANT SELECT, INSERT         ON public.support_ticket_messages    TO authenticated;
GRANT SELECT, INSERT, DELETE ON public.support_ticket_attachments TO authenticated;
GRANT SELECT                 ON public.support_ticket_migration_map, public.support_ticket_migration_checks TO authenticated;

-- Tickets: staff see everything (including soft-deleted); a reporter sees only
-- their own live Unicorn tickets, and only while they still have tenant access.
CREATE POLICY support_tickets_select ON public.support_tickets
  FOR SELECT TO authenticated
  USING (
    public.is_vivacity_team_safe((SELECT auth.uid()))
    OR (
      deleted_at IS NULL
      AND product = 'unicorn'
      AND reporter_id = (SELECT auth.uid())
      AND public.has_tenant_access_safe(tenant_id, (SELECT auth.uid()))
    )
  );

-- No INSERT policy: creation is RPC-only. No DELETE policy: soft delete only.
CREATE POLICY support_tickets_update ON public.support_tickets
  FOR UPDATE TO authenticated
  USING (public.is_vivacity_team_safe((SELECT auth.uid())))
  WITH CHECK (public.is_vivacity_team_safe((SELECT auth.uid())));

-- Messages: staff see all; a reporter sees only non-staff-only rows on a
-- ticket they can see.
CREATE POLICY support_ticket_messages_select ON public.support_ticket_messages
  FOR SELECT TO authenticated
  USING (
    public.is_vivacity_team_safe((SELECT auth.uid()))
    OR (NOT staff_only AND public.can_view_support_ticket(ticket_id))
  );

-- Replies only (events and AI drafts come from triggers, RPC or service role).
CREATE POLICY support_ticket_messages_insert ON public.support_ticket_messages
  FOR INSERT TO authenticated
  WITH CHECK (
    author_id = (SELECT auth.uid())
    AND kind = 'reply'
    AND (
      public.is_vivacity_team_safe((SELECT auth.uid()))
      OR (staff_only = false AND public.can_view_support_ticket(ticket_id))
    )
  );

CREATE POLICY support_ticket_attachments_select ON public.support_ticket_attachments
  FOR SELECT TO authenticated
  USING (
    public.is_vivacity_team_safe((SELECT auth.uid()))
    OR (
      public.can_view_support_ticket(ticket_id)
      AND (
        message_id IS NULL
        OR EXISTS (
          SELECT 1 FROM public.support_ticket_messages m
          WHERE m.id = message_id AND NOT m.staff_only
        )
      )
    )
  );

CREATE POLICY support_ticket_attachments_insert ON public.support_ticket_attachments
  FOR INSERT TO authenticated
  WITH CHECK (
    uploaded_by = (SELECT auth.uid())
    AND bucket = 'ticket-files'
    AND (
      public.is_vivacity_team_safe((SELECT auth.uid()))
      OR public.can_view_support_ticket(ticket_id)
    )
    AND (
      message_id IS NULL
      OR EXISTS (
        SELECT 1 FROM public.support_ticket_messages m
        WHERE m.id = message_id AND m.ticket_id = support_ticket_attachments.ticket_id
      )
    )
  );

CREATE POLICY support_ticket_attachments_delete ON public.support_ticket_attachments
  FOR DELETE TO authenticated
  USING (
    public.is_vivacity_team_safe((SELECT auth.uid()))
    OR uploaded_by = (SELECT auth.uid())
  );

CREATE POLICY support_ticket_migration_map_select ON public.support_ticket_migration_map
  FOR SELECT TO authenticated
  USING (public.is_vivacity_team_safe((SELECT auth.uid())));

CREATE POLICY support_ticket_migration_checks_select ON public.support_ticket_migration_checks
  FOR SELECT TO authenticated
  USING (public.is_vivacity_team_safe((SELECT auth.uid())));

-- ---------------------------------------------------------------------------
-- 7. Storage: private bucket for new uploads; read policy also covers the two
--    legacy buckets so migrated files stay readable in place.
-- ---------------------------------------------------------------------------

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('ticket-files', 'ticket-files', false, 10485760,
        ARRAY['image/png', 'image/jpeg', 'image/gif', 'image/webp', 'application/pdf', 'text/plain'])
ON CONFLICT (id) DO NOTHING;

CREATE POLICY support_ticket_files_read ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id IN ('ticket-files', 'suggest-attachments', 'support-attachments')
    AND public.can_read_support_file(bucket_id, name)
  );

CREATE POLICY support_ticket_files_upload ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'ticket-files'
    AND CASE
      WHEN (storage.foldername(name))[1] ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
        THEN public.can_view_support_ticket(((storage.foldername(name))[1])::uuid)
      ELSE false
    END
  );

CREATE POLICY support_ticket_files_delete ON storage.objects
  FOR DELETE TO authenticated
  USING (
    bucket_id = 'ticket-files'
    AND (
      public.is_vivacity_team_safe((SELECT auth.uid()))
      OR owner_id = ((SELECT auth.uid()))::text
    )
  );
