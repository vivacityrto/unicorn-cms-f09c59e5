-- Support tickets: backfill from the legacy systems into the new model.
--   suggest_items (+ suggest_attachments)         -> support_tickets, same id
--   help_threads where channel = 'support'
--     (+ help_messages and their attachments)      -> support_tickets, same id
-- Chat-bot threads, CSC conversations and kpi_tickets are NOT touched.
-- Originals are never modified. Re-runnable (ON CONFLICT DO NOTHING, deterministic
-- message ids), so the cut-over can run it again as a delta.
--
-- The whole block runs in one transaction. Reconciliation at the end compares
-- legacy and new counts and per-ticket content hashes; any mismatch raises and
-- the whole migration rolls back. Results are kept in support_ticket_migration_checks.
--
-- migration-target-project: yxkgdalkbrriasiyyrwk
-- Rollback: supabase/migrations/rollback/20261113110000_support_tickets_backfill.down.sql

DO $backfill$
DECLARE
  v_note   text := 'Migrated from the previous ticketing system on '
                   || to_char(now() AT TIME ZONE 'Australia/Sydney', 'FMDD FMMonth YYYY');
  v_failed text;
  v_conflict text;
BEGIN
  IF to_regclass('public.suggest_items') IS NULL AND to_regclass('public.help_threads') IS NULL THEN
    RETURN;
  END IF;

  -- Decode %XX sequences in stored public-URL paths back to the object name.
  CREATE FUNCTION pg_temp.url_decode(p text) RETURNS text
  LANGUAGE sql IMMUTABLE AS $f$
    SELECT convert_from(decode(string_agg(
             CASE WHEN t.m[1] IS NOT NULL THEN t.m[1]
                  ELSE encode(convert_to(t.m[2], 'UTF8'), 'hex') END, '' ORDER BY t.n), 'hex'), 'UTF8')
    FROM regexp_matches(p, '%([0-9a-fA-F]{2})|([^%]+|%)', 'g') WITH ORDINALITY AS t(m, n)
  $f$;

  ALTER TABLE public.support_tickets         DISABLE TRIGGER USER;
  ALTER TABLE public.support_ticket_messages DISABLE TRIGGER USER;

  -- Mapping tables (the decided mapping lives here and nowhere else).
  CREATE TEMP TABLE _map_type (legacy text PRIMARY KEY, new text NOT NULL) ON COMMIT DROP;
  INSERT INTO _map_type VALUES
    ('error', 'bug'), ('functionality_fail', 'bug'),
    ('suggestion', 'request'), ('improvement', 'request'), ('data_enhancement', 'request'),
    ('question', 'question'), ('other', 'other');
  CREATE TEMP TABLE _map_status (legacy text PRIMARY KEY, new text NOT NULL) ON COMMIT DROP;
  INSERT INTO _map_status VALUES
    ('new', 'new'), ('triaged', 'in_progress'), ('in_progress', 'in_progress'),
    ('blocked', 'waiting'), ('resolved', 'resolved'), ('closed', 'closed');

  -- Stage every ticket from both sources with its final column values.
  CREATE TEMP TABLE _stage (
    id uuid PRIMARY KEY, src text NOT NULL, tenant_id bigint NOT NULL, reporter_id uuid NOT NULL,
    type text NOT NULL, status text NOT NULL, urgency text NOT NULL, title text NOT NULL,
    assignee_id uuid, source_url text, created_at timestamptz NOT NULL, updated_at timestamptz NOT NULL,
    resolved_at timestamptz, last_activity_at timestamptz NOT NULL, deleted_at timestamptz
  ) ON COMMIT DROP;

  IF to_regclass('public.suggest_items') IS NOT NULL THEN
    INSERT INTO _stage
    SELECT s.id, 'suggest_items', s.tenant_id, s.reported_by,
           COALESCE(mt.new, 'other'),
           COALESCE(ms.new, 'new'),
           CASE WHEN s.urgency IN ('low', 'medium', 'high', 'critical') THEN s.urgency ELSE 'medium' END,
           COALESCE(NULLIF(left(btrim(s.title), 300), ''), 'Untitled ticket'),
           s.assigned_to, left(s.source_page_url, 500),
           s.created_at, s.updated_at,
           CASE WHEN COALESCE(ms.new, 'new') IN ('resolved', 'closed') THEN COALESCE(s.resolved_at, s.updated_at) END,
           s.updated_at,
           CASE WHEN s.is_deleted THEN s.updated_at END
    FROM public.suggest_items s
    LEFT JOIN public.dd_suggest_item_type ty ON ty.id = s.suggest_item_type_id
    LEFT JOIN _map_type   mt ON mt.legacy = ty.code
    LEFT JOIN public.dd_suggest_status    st ON st.id = s.suggest_status_id
    LEFT JOIN _map_status ms ON ms.legacy = st.code;
  END IF;

  IF to_regclass('public.help_threads') IS NOT NULL THEN
    INSERT INTO _stage
    SELECT t.id, 'help_threads', t.tenant_id, t.user_id, 'other',
           CASE t.status
             WHEN 'resolved' THEN 'resolved'
             WHEN 'open' THEN CASE WHEN EXISTS (SELECT 1 FROM public.help_messages m WHERE m.thread_id = t.id AND m.role = 'staff')
                                   THEN 'in_progress' ELSE 'new' END
             ELSE 'closed' END,
           'medium',
           COALESCE(NULLIF(left(btrim(t.subject), 300), ''),
                    NULLIF(left(btrim(regexp_replace(COALESCE(fm.content, ''), '\s+', ' ', 'g')), 80), ''),
                    'Support request'),
           NULL, left(t.metadata ->> 'page_path', 500),
           t.created_at, t.updated_at,
           CASE WHEN t.status IN ('resolved', 'closed') THEN t.updated_at END,
           GREATEST(t.updated_at, COALESCE(lm.last_at, t.updated_at)),
           NULL
    FROM public.help_threads t
    LEFT JOIN LATERAL (
      SELECT m.content FROM public.help_messages m
      WHERE m.thread_id = t.id AND m.role = 'user' ORDER BY m.created_at, m.id LIMIT 1
    ) fm ON true
    LEFT JOIN LATERAL (
      SELECT max(m.created_at) AS last_at FROM public.help_messages m WHERE m.thread_id = t.id
    ) lm ON true
    WHERE t.channel = 'support';
  END IF;

  -- Tickets, in created order so ticket_number follows history. Only rows this
  -- run actually inserts are recorded in _new_tickets: a ticket migrated earlier
  -- may since have been changed through the new UI, so the field-level
  -- reconciliation below must not hold it to the unchanged legacy row.
  CREATE TEMP TABLE _new_tickets (id uuid PRIMARY KEY) ON COMMIT DROP;
  WITH ins AS (
    INSERT INTO public.support_tickets
      (id, product, tenant_id, reporter_id, type, status, urgency, title, assignee_id, source_url,
       ai_state, created_at, updated_at, resolved_at, last_activity_at, deleted_at)
    SELECT id, 'unicorn', tenant_id, reporter_id, type, status, urgency, title, assignee_id, source_url,
           'none', created_at, updated_at, resolved_at, last_activity_at, deleted_at
    FROM _stage
    ORDER BY created_at, id
    ON CONFLICT (id) DO NOTHING
    RETURNING id
  )
  INSERT INTO _new_tickets SELECT id FROM ins;

  CREATE TEMP TABLE _stage_new ON COMMIT DROP AS
    SELECT s.* FROM _stage s JOIN _new_tickets n ON n.id = s.id;

  INSERT INTO public.support_ticket_migration_map (legacy_table, legacy_id, ticket_id)
  SELECT src, id, id FROM _stage
  ON CONFLICT DO NOTHING;

  -- Tickets already migrated by an earlier run whose legacy row has changed
  -- since (an old-system edit between the first import and cut-over):
  --   * unchanged in the new system  -> re-sync the fields from the legacy row;
  --   * changed on both sides        -> stop, so a person decides, nothing is lost silently.
  -- A change is detected by the legacy updated_at passing the migration time;
  -- a new-system change by the ticket's updated_at passing it (the update
  -- trigger sets it to now()). Only rows whose mapped fields actually differ count.
  CREATE TEMP TABLE _drift ON COMMIT DROP AS
  SELECT s.id, (t.updated_at > m.migrated_at) AS changed_in_new
  FROM _stage s
  JOIN public.support_ticket_migration_map m ON m.ticket_id = s.id AND m.legacy_table = s.src
  JOIN public.support_tickets t ON t.id = s.id
  WHERE s.id NOT IN (SELECT id FROM _new_tickets)
    AND s.updated_at > m.migrated_at
    AND (t.type, t.status, t.urgency, t.title, t.assignee_id, t.deleted_at)
        IS DISTINCT FROM (s.type, s.status, s.urgency, s.title, s.assignee_id, s.deleted_at);

  SELECT string_agg(id::text, ', ') INTO v_conflict FROM _drift WHERE changed_in_new;
  IF v_conflict IS NOT NULL THEN
    RAISE EXCEPTION 'delta backfill: ticket(s) changed in both the old and the new system, decide by hand before cut-over: %', v_conflict;
  END IF;

  CREATE TEMP TABLE _resync ON COMMIT DROP AS SELECT id FROM _drift;

  UPDATE public.support_tickets t
     SET type = s.type, status = s.status, urgency = s.urgency, title = s.title,
         assignee_id = s.assignee_id, resolved_at = s.resolved_at, deleted_at = s.deleted_at,
         last_activity_at = s.last_activity_at, updated_at = s.updated_at
    FROM _stage s
   WHERE s.id = t.id AND t.id IN (SELECT id FROM _resync);

  INSERT INTO public.support_ticket_messages (id, ticket_id, author_id, kind, staff_only, body, created_at)
  SELECT md5('stm:resync:' || r.id || ':' || floor(extract(epoch FROM now()))::bigint)::uuid, r.id, NULL, 'event', true,
         'Updated from the previous ticketing system on '
           || to_char(now() AT TIME ZONE 'Australia/Sydney', 'FMDD FMMonth YYYY')
           || ' (it was changed there after the first import)', now()
  FROM _resync r
  ON CONFLICT (id) DO NOTHING;

  UPDATE public.support_ticket_migration_map m
     SET migrated_at = now()
   WHERE m.ticket_id IN (SELECT id FROM _resync);

  -- Message 1 of every suggest_items ticket: the legacy description, verbatim.
  CREATE TEMP TABLE _msg (
    id uuid PRIMARY KEY, ticket_id uuid NOT NULL, author_id uuid, kind text NOT NULL,
    staff_only boolean NOT NULL, body text NOT NULL, created_at timestamptz NOT NULL, grp text NOT NULL
  ) ON COMMIT DROP;

  IF to_regclass('public.suggest_items') IS NOT NULL THEN
    INSERT INTO _msg
    SELECT md5('stm:first:' || s.id)::uuid, s.id, s.reported_by, 'reply', false,
           COALESCE(NULLIF(s.description, ''), '(no description)'), s.created_at, 'first'
    FROM public.suggest_items s;

    -- Message 2: structured fields the reporter supplied, labelled; never merged into message 1.
    INSERT INTO _msg
    SELECT md5('stm:details:' || d.id)::uuid, d.id, d.reported_by, 'reply', false, d.body,
           d.created_at + interval '1 millisecond', 'details'
    FROM (
      SELECT s.id, s.reported_by, s.created_at,
        concat_ws(E'\n\n',
          CASE WHEN NULLIF(btrim(s.trying_to_do), '') IS NOT NULL AND position(btrim(s.trying_to_do) IN s.description) = 0
               THEN 'What I was trying to do: ' || s.trying_to_do END,
          CASE WHEN NULLIF(btrim(s.what_happened), '') IS NOT NULL AND position(btrim(s.what_happened) IN s.description) = 0
               THEN 'What happened instead: ' || s.what_happened END,
          CASE WHEN NULLIF(btrim(s.error_message), '') IS NOT NULL THEN 'Error message: ' || s.error_message END,
          CASE WHEN s.affected_areas IS NOT NULL AND cardinality(s.affected_areas) > 0
               THEN 'Affected areas: ' || array_to_string(s.affected_areas, ', ') END,
          CASE WHEN NULLIF(btrim(s.steps_to_reproduce), '') IS NOT NULL THEN 'Steps to reproduce: ' || s.steps_to_reproduce END,
          CASE WHEN NULLIF(btrim(s.expected_behaviour), '') IS NOT NULL THEN 'Expected behaviour: ' || s.expected_behaviour END,
          CASE WHEN NULLIF(btrim(s.feature_context), '') IS NOT NULL THEN 'Feature context: ' || s.feature_context END,
          CASE WHEN NULLIF(btrim(s.improvement_context), '') IS NOT NULL THEN 'Current experience: ' || s.improvement_context END,
          CASE WHEN COALESCE(NULLIF(btrim(s.source_page_label), ''), NULLIF(btrim(s.source_area), ''), NULLIF(btrim(s.source_component), '')) IS NOT NULL
               THEN 'Reported from: ' || concat_ws(' / ', NULLIF(btrim(s.source_page_label), ''), NULLIF(btrim(s.source_area), ''), NULLIF(btrim(s.source_component), '')) END
        ) AS body
      FROM public.suggest_items s
    ) d
    WHERE d.body <> '';

    -- Resolution notes become public replies (the client portal shows them today).
    INSERT INTO _msg
    SELECT md5('stm:note:' || s.id)::uuid, s.id, u.user_uuid, 'reply', false, s.resolution_notes,
           GREATEST(COALESCE(s.resolved_at, s.updated_at), s.created_at + interval '2 milliseconds'), 'note'
    FROM public.suggest_items s
    LEFT JOIN public.users u ON u.user_uuid = s.resolved_by
    WHERE NULLIF(btrim(s.resolution_notes), '') IS NOT NULL;
  END IF;

  IF to_regclass('public.help_threads') IS NOT NULL THEN
    -- Support-thread messages 1:1, same ids, order and timestamps.
    INSERT INTO _msg
    SELECT m.id, m.thread_id, u.user_uuid, 'reply', false,
           COALESCE(NULLIF(m.content, ''), '(attachment only)'), m.created_at, 'help'
    FROM public.help_messages m
    JOIN public.help_threads t ON t.id = m.thread_id AND t.channel = 'support'
    LEFT JOIN public.users u ON u.user_uuid = m.sender_id;

    -- Diagnostics captured by the old panel become a staff-only note.
    INSERT INTO _msg
    SELECT md5('stm:diag:' || t.id)::uuid, t.id, NULL, 'event', true,
           'Diagnostics captured at submission' || E'\n' || concat_ws(E'\n',
             CASE WHEN t.metadata ->> 'page_path' IS NOT NULL THEN 'Page: ' || left(t.metadata ->> 'page_path', 300) END,
             CASE WHEN t.metadata ->> 'browser'   IS NOT NULL THEN 'Browser: ' || left(t.metadata ->> 'browser', 60) END,
             CASE WHEN t.metadata ->> 'os'        IS NOT NULL THEN 'Operating system: ' || left(t.metadata ->> 'os', 60) END,
             CASE WHEN t.metadata ->> 'screen'    IS NOT NULL THEN 'Screen: ' || left(t.metadata ->> 'screen', 30) END),
           t.created_at + interval '1 millisecond', 'diag'
    FROM public.help_threads t
    WHERE t.channel = 'support'
      AND (t.metadata ? 'page_path' OR t.metadata ? 'browser' OR t.metadata ? 'os' OR t.metadata ? 'screen');
  END IF;

  -- One staff-only event per migrated ticket.
  INSERT INTO _msg
  SELECT md5('stm:migrated:' || id)::uuid, id, NULL, 'event', true, v_note, now(), 'migrated'
  FROM _stage;

  INSERT INTO public.support_ticket_messages (id, ticket_id, author_id, kind, staff_only, body, created_at)
  SELECT id, ticket_id, author_id, kind, staff_only, body, created_at FROM _msg
  ON CONFLICT (id) DO NOTHING;

  -- Attachments reference the original objects in place (nothing is moved).
  CREATE TEMP TABLE _att (
    id uuid PRIMARY KEY, ticket_id uuid NOT NULL, message_id uuid, bucket text NOT NULL,
    storage_path text NOT NULL, file_name text NOT NULL, mime_type text, size_bytes bigint,
    uploaded_by uuid, created_at timestamptz NOT NULL
  ) ON COMMIT DROP;

  IF to_regclass('public.suggest_attachments') IS NOT NULL THEN
    INSERT INTO _att
    SELECT a.id, a.suggest_item_id, NULL, 'suggest-attachments', a.file_path, a.file_name,
           a.mime_type, a.file_size_bytes, u.user_uuid, a.created_at
    FROM public.suggest_attachments a
    JOIN _stage s ON s.id = a.suggest_item_id
    LEFT JOIN public.users u ON u.user_uuid = a.created_by;
  END IF;

  IF to_regclass('public.help_messages') IS NOT NULL THEN
    INSERT INTO _att
    SELECT md5('sta:' || m.id || ':' || e.n)::uuid, m.thread_id, m.id, 'support-attachments',
           pg_temp.url_decode(substring(e.a ->> 'url' FROM 'support-attachments/([^?]+)')),
           COALESCE(NULLIF(e.a ->> 'name', ''), 'attachment'), e.a ->> 'type', NULL, u.user_uuid, m.created_at
    FROM public.help_messages m
    JOIN public.help_threads t ON t.id = m.thread_id AND t.channel = 'support'
    CROSS JOIN LATERAL jsonb_array_elements(m.metadata -> 'attachments') WITH ORDINALITY AS e(a, n)
    LEFT JOIN public.users u ON u.user_uuid = m.sender_id
    WHERE jsonb_typeof(m.metadata -> 'attachments') = 'array'
      AND e.a ->> 'url' ~ 'support-attachments/';
  END IF;

  INSERT INTO public.support_ticket_attachments
    (id, ticket_id, message_id, bucket, storage_path, file_name, mime_type, size_bytes, uploaded_by, created_at)
  SELECT id, ticket_id, message_id, bucket, storage_path, file_name, mime_type, size_bytes, uploaded_by, created_at
  FROM _att
  ON CONFLICT DO NOTHING;

  -- ------------------------------------------------------------------
  -- Reconciliation: legacy (staged) versus what actually landed.
  -- ------------------------------------------------------------------
  INSERT INTO public.support_ticket_migration_checks (check_name, legacy_value, new_value, ok)
  SELECT c.name, c.legacy, c.new, c.legacy IS NOT DISTINCT FROM c.new
  FROM (
    SELECT 'tickets from suggest_items' AS name,
           (SELECT count(*)::text FROM _stage WHERE src = 'suggest_items') AS legacy,
           (SELECT count(*)::text FROM public.support_tickets t JOIN public.support_ticket_migration_map m
              ON m.ticket_id = t.id AND m.legacy_table = 'suggest_items') AS new
    UNION ALL SELECT 'tickets from support threads',
           (SELECT count(*)::text FROM _stage WHERE src = 'help_threads'),
           (SELECT count(*)::text FROM public.support_tickets t JOIN public.support_ticket_migration_map m
              ON m.ticket_id = t.id AND m.legacy_table = 'help_threads')
    UNION ALL SELECT 'status distribution',
           (SELECT COALESCE(string_agg(status || '=' || n, ',' ORDER BY status), '') FROM (SELECT status, count(*) n FROM _stage_new GROUP BY 1) x),
           (SELECT COALESCE(string_agg(status || '=' || n, ',' ORDER BY status), '') FROM (SELECT t.status, count(*) n FROM public.support_tickets t JOIN _stage_new s ON s.id = t.id GROUP BY 1) x)
    UNION ALL SELECT 'type distribution',
           (SELECT COALESCE(string_agg(type || '=' || n, ',' ORDER BY type), '') FROM (SELECT type, count(*) n FROM _stage_new GROUP BY 1) x),
           (SELECT COALESCE(string_agg(type || '=' || n, ',' ORDER BY type), '') FROM (SELECT t.type, count(*) n FROM public.support_tickets t JOIN _stage_new s ON s.id = t.id GROUP BY 1) x)
    UNION ALL SELECT 'urgency distribution',
           (SELECT COALESCE(string_agg(urgency || '=' || n, ',' ORDER BY urgency), '') FROM (SELECT urgency, count(*) n FROM _stage_new GROUP BY 1) x),
           (SELECT COALESCE(string_agg(urgency || '=' || n, ',' ORDER BY urgency), '') FROM (SELECT t.urgency, count(*) n FROM public.support_tickets t JOIN _stage_new s ON s.id = t.id GROUP BY 1) x)
    UNION ALL SELECT 'tenant distribution',
           (SELECT COALESCE(string_agg(tenant_id || '=' || n, ',' ORDER BY tenant_id), '') FROM (SELECT tenant_id, count(*) n FROM _stage_new GROUP BY 1) x),
           (SELECT COALESCE(string_agg(tenant_id || '=' || n, ',' ORDER BY tenant_id), '') FROM (SELECT t.tenant_id, count(*) n FROM public.support_tickets t JOIN _stage_new s ON s.id = t.id GROUP BY 1) x)
    UNION ALL SELECT 'assigned tickets',
           (SELECT count(*)::text FROM _stage_new WHERE assignee_id IS NOT NULL),
           (SELECT count(*)::text FROM public.support_tickets t JOIN _stage_new s ON s.id = t.id WHERE t.assignee_id IS NOT NULL)
    UNION ALL SELECT 'deleted tickets',
           (SELECT count(*)::text FROM _stage_new WHERE deleted_at IS NOT NULL),
           (SELECT count(*)::text FROM public.support_tickets t JOIN _stage_new s ON s.id = t.id WHERE t.deleted_at IS NOT NULL)
    UNION ALL SELECT 'tickets edited in the old system are re-synced',
           '0',
           (SELECT count(*)::text FROM _resync r
              JOIN _stage s ON s.id = r.id
              JOIN public.support_tickets t ON t.id = r.id
             WHERE (t.type, t.status, t.urgency, t.title, t.assignee_id, t.deleted_at)
                   IS DISTINCT FROM (s.type, s.status, s.urgency, s.title, s.assignee_id, s.deleted_at))
    UNION ALL SELECT 'messages (all kinds)',
           (SELECT count(*)::text FROM _msg),
           (SELECT count(*)::text FROM public.support_ticket_messages m JOIN _msg x ON x.id = m.id)
    UNION ALL SELECT 'attachments',
           (SELECT count(*)::text FROM _att),
           (SELECT count(*)::text FROM public.support_ticket_attachments a JOIN _att x ON x.id = a.id)
    UNION ALL SELECT 'staff-only messages stay staff-only',
           (SELECT count(*)::text FROM _msg WHERE staff_only),
           (SELECT count(*)::text FROM public.support_ticket_messages m JOIN _msg x ON x.id = m.id WHERE m.staff_only)
    UNION ALL SELECT 'content hash mismatches (title + first message)',
           '0',
           (SELECT count(*)::text
              FROM _stage_new s
              JOIN public.support_tickets t ON t.id = s.id
              JOIN _msg f ON f.ticket_id = s.id AND f.grp IN ('first', 'help')
                          AND f.created_at = (SELECT min(f2.created_at) FROM _msg f2 WHERE f2.ticket_id = s.id AND f2.grp IN ('first', 'help'))
              JOIN public.support_ticket_messages nm ON nm.id = f.id
              WHERE md5(s.title || f.body) IS DISTINCT FROM md5(t.title || nm.body))
  ) c;

  SELECT string_agg(check_name || ' (legacy ' || COALESCE(legacy_value, 'null') || ' vs new ' || COALESCE(new_value, 'null') || ')', '; ')
    INTO v_failed
  FROM public.support_ticket_migration_checks
  WHERE ok = false AND run_at >= now() - interval '1 minute' AND run_at = (SELECT max(run_at) FROM public.support_ticket_migration_checks);

  IF v_failed IS NOT NULL THEN
    RAISE EXCEPTION 'support ticket backfill reconciliation failed: %', v_failed;
  END IF;

  ALTER TABLE public.support_tickets         ENABLE TRIGGER USER;
  ALTER TABLE public.support_ticket_messages ENABLE TRIGGER USER;
END
$backfill$;
