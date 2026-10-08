-- =====================================================================
-- Teams event registration — foundation
--
-- Adds the RBAC feature, and the batch + item tables that back the
-- "Register for Teams Event" workflow in the Contact Directory
-- (Unicorn_2_Teams_Event_Registration_Technical_Requirements, sections
-- 11, 12 and 15).
--
-- Design notes
--   * Staff-only. Neither table is reachable by tenant users or tenant
--     contacts. SELECT is gated on the new feature key (Super Admin
--     always passes check_permission). There are deliberately NO
--     INSERT/UPDATE/DELETE policies: every write comes from the Teams
--     event Edge Functions using the service role, after they have
--     re-authorised the caller and re-resolved the group server-side.
--   * Idempotency is enforced by the database, not just the function:
--       - one live (queued/processing) batch per event + group
--       - one success row per event + normalised email, across batches
--       - one pending/success/failed row per batch + normalised email
--   * Group membership is NOT copied here. The existing
--     tenant_contact_groups / tenant_contact_group_members tables remain
--     the only source of group membership; items are a processing
--     snapshot for audit, retry and support.
--
-- ROLLBACK:
--   DROP TABLE IF EXISTS public.teams_event_registration_items;
--   DROP TABLE IF EXISTS public.teams_event_registration_batches;
--   DELETE FROM public.role_permissions WHERE feature_key = 'teams_events.manage_registrations';
--   DELETE FROM public.permission_features WHERE feature_key = 'teams_events.manage_registrations';
-- =====================================================================

-- ─────────────────────────────────────────────────────────────
-- SECTION 1 — RBAC feature
-- ─────────────────────────────────────────────────────────────

INSERT INTO public.permission_features (feature_key, label, module, category, description, is_active, sort_order)
VALUES (
  'teams_events.manage_registrations',
  'Manage Teams event registrations',
  'Administration',
  'Administration',
  'List Microsoft Teams events and bulk-register Contact Directory Group members via the Teams event Edge Functions',
  true,
  46
)
ON CONFLICT (feature_key) DO NOTHING;

-- Super Admin, Integrator and BGT (the roles that run Teams webinar
-- registration today) get full access; the remaining internal roles none
-- until the business decides who else may bulk-register people.
INSERT INTO public.role_permissions (feature_key, role, level) VALUES
  ('teams_events.manage_registrations', 'Super Admin', 'full'),
  ('teams_events.manage_registrations', 'Team Leader', 'none'),
  ('teams_events.manage_registrations', 'Integrator', 'full'),
  ('teams_events.manage_registrations', 'BGT', 'full'),
  ('teams_events.manage_registrations', 'CSC', 'none'),
  ('teams_events.manage_registrations', 'CET', 'none')
ON CONFLICT (role, feature_key) DO NOTHING;

-- ─────────────────────────────────────────────────────────────
-- SECTION 2 — batches
-- ─────────────────────────────────────────────────────────────

CREATE TABLE public.teams_event_registration_batches (
  id                    uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  event_type            text        NOT NULL
                                    CONSTRAINT teams_event_batches_event_type_check
                                    CHECK (event_type IN ('webinar', 'meeting')),
  graph_event_id        text        NOT NULL,
  event_display_name    text        NOT NULL,
  event_start_datetime  timestamptz NOT NULL,
  event_timezone        text        NOT NULL DEFAULT 'Australia/Sydney',
  graph_organiser_id    text        NULL,
  -- Nullable + SET NULL so deleting a group never destroys audit history;
  -- group_name is the display-name snapshot taken when the batch ran.
  group_id              bigint      NULL
                                    REFERENCES public.tenant_contact_groups(id) ON DELETE SET NULL,
  group_name            text        NOT NULL,
  eligible_count        integer     NOT NULL DEFAULT 0,
  submitted_count       integer     NOT NULL DEFAULT 0,
  success_count         integer     NOT NULL DEFAULT 0,
  skipped_count         integer     NOT NULL DEFAULT 0,
  failure_count         integer     NOT NULL DEFAULT 0,
  status                text        NOT NULL DEFAULT 'queued'
                                    CONSTRAINT teams_event_batches_status_check
                                    CHECK (status IN (
                                      'previewed', 'queued', 'processing',
                                      'completed', 'completed_with_errors', 'failed'
                                    )),
  initiated_by_user_id  uuid        NOT NULL,
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now(),
  started_at            timestamptz NULL,
  completed_at          timestamptz NULL
);

CREATE INDEX idx_teams_event_batches_event
  ON public.teams_event_registration_batches (event_type, graph_event_id);
CREATE INDEX idx_teams_event_batches_initiated_by
  ON public.teams_event_registration_batches (initiated_by_user_id, created_at DESC);

-- Concurrency lock: only one live batch per event + group. A second
-- operator submitting the same pair gets a unique violation (23505), which
-- the Edge Function turns into a 409.
CREATE UNIQUE INDEX uq_teams_event_batches_live_lock
  ON public.teams_event_registration_batches (event_type, graph_event_id, group_id)
  WHERE status IN ('queued', 'processing');

-- ─────────────────────────────────────────────────────────────
-- SECTION 3 — items
-- ─────────────────────────────────────────────────────────────

CREATE TABLE public.teams_event_registration_items (
  id                         uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  batch_id                   uuid        NOT NULL
                                         REFERENCES public.teams_event_registration_batches(id) ON DELETE CASCADE,
  tenant_id                  bigint      NOT NULL
                                         REFERENCES public.tenants(id) ON DELETE CASCADE,
  tenant_user_id             bigint      NULL,
  tenant_contact_id          bigint      NULL,
  -- Denormalised from the batch so the cross-batch success uniqueness
  -- below can be a plain partial index.
  event_type                 text        NOT NULL,
  graph_event_id             text        NOT NULL,
  -- NULL only for excluded rows whose email was missing/unparseable.
  normalised_email           text        NULL,
  first_name                 text        NULL,
  last_name                  text        NULL,
  result_status              text        NOT NULL DEFAULT 'pending'
                                         CONSTRAINT teams_event_items_status_check
                                         CHECK (result_status IN (
                                           'pending', 'registered', 'invited',
                                           'already_processed', 'excluded',
                                           'duplicate', 'failed'
                                         )),
  exclusion_reason           text        NULL,
  graph_registration_id      text        NULL,
  -- Only populated with an approved business need (brief section 19).
  -- Never logged. Left NULL by Phase 1.
  graph_join_url_encrypted   text        NULL,
  error_code                 text        NULL,
  error_message              text        NULL,
  attempt_count              integer     NOT NULL DEFAULT 0,
  created_at                 timestamptz NOT NULL DEFAULT now(),
  updated_at                 timestamptz NOT NULL DEFAULT now(),
  processed_at               timestamptz NULL,
  CONSTRAINT teams_event_items_one_source_check
    CHECK (num_nonnulls(tenant_user_id, tenant_contact_id) = 1)
);

CREATE INDEX idx_teams_event_items_batch ON public.teams_event_registration_items (batch_id);
CREATE INDEX idx_teams_event_items_batch_status ON public.teams_event_registration_items (batch_id, result_status);
CREATE INDEX idx_teams_event_items_tenant ON public.teams_event_registration_items (tenant_id);

-- One row per person per batch (excluded/duplicate rows exist only so they
-- can be reported, and may legitimately share an email with the kept row).
CREATE UNIQUE INDEX uq_teams_event_items_batch_email
  ON public.teams_event_registration_items (batch_id, normalised_email)
  WHERE result_status NOT IN ('duplicate', 'excluded');

-- Logical uniqueness key from the brief: event_type + graph_event_id +
-- normalised_email may only ever succeed once, across all batches. This is
-- the database backstop behind the "check local success records" step.
CREATE UNIQUE INDEX uq_teams_event_items_event_email_success
  ON public.teams_event_registration_items (event_type, graph_event_id, normalised_email)
  WHERE result_status IN ('registered', 'invited');

-- ─────────────────────────────────────────────────────────────
-- SECTION 4 — RLS (staff-only read; service-role-only write)
-- ─────────────────────────────────────────────────────────────

ALTER TABLE public.teams_event_registration_batches ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.teams_event_registration_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "teams_event_batches_select" ON public.teams_event_registration_batches
  FOR SELECT TO authenticated
  USING (
    public.is_super_admin_safe((SELECT auth.uid()))
    OR public.check_permission((SELECT auth.uid()), 'teams_events.manage_registrations', 'full')
  );

CREATE POLICY "teams_event_items_select" ON public.teams_event_registration_items
  FOR SELECT TO authenticated
  USING (
    public.is_super_admin_safe((SELECT auth.uid()))
    OR public.check_permission((SELECT auth.uid()), 'teams_events.manage_registrations', 'full')
  );

-- Belt and braces: even if a write policy were added by mistake later, the
-- table privileges keep browser roles read-only.
REVOKE ALL ON public.teams_event_registration_batches FROM anon, authenticated;
REVOKE ALL ON public.teams_event_registration_items FROM anon, authenticated;
GRANT SELECT ON public.teams_event_registration_batches TO authenticated;
GRANT SELECT ON public.teams_event_registration_items TO authenticated;
GRANT ALL ON public.teams_event_registration_batches TO service_role;
GRANT ALL ON public.teams_event_registration_items TO service_role;
