-- =====================================================================
-- Teams event attendance (Events registry)
--
-- Adds the table that records, by hand, whether a person actually attended
-- a Teams webinar that was registered through Unicorn. Backs the Events
-- registry sub-page of the Contact Directory.
--
-- Design notes
--   * Staff-only, same gate as the registration tables: SELECT needs
--     teams_events.manage_registrations (Super Admin always passes). There
--     are deliberately NO INSERT/UPDATE/DELETE policies and browser roles
--     are revoked: every write comes from the set-teams-event-attendance
--     Edge Function using the service role, after it re-authorises the
--     caller and re-resolves the person server-side.
--   * One row per event + person, keyed by normalised email (the same key
--     the registration items use), so marking attendance twice updates the
--     same row.
--   * walk_in = attended without a live registration for that event
--     (decided server-side, never trusted from the browser).
--   * No new RBAC feature: it reuses teams_events.manage_registrations.
--
-- ROLLBACK:
--   DROP TABLE IF EXISTS public.teams_event_attendance;
-- =====================================================================

CREATE TABLE public.teams_event_attendance (
  id                   uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  event_type           text        NOT NULL
                                   CONSTRAINT teams_event_attendance_event_type_check
                                   CHECK (event_type IN ('webinar', 'meeting')),
  graph_event_id       text        NOT NULL,
  normalised_email     text        NOT NULL,
  tenant_id            bigint      NULL REFERENCES public.tenants(id) ON DELETE SET NULL,
  tenant_user_id       bigint      NULL,
  tenant_contact_id    bigint      NULL,
  first_name           text        NULL,
  last_name            text        NULL,
  attended             boolean     NOT NULL DEFAULT true,
  walk_in              boolean     NOT NULL DEFAULT false,
  marked_by_user_id    uuid        NOT NULL,
  created_at           timestamptz NOT NULL DEFAULT now(),
  updated_at           timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT teams_event_attendance_one_source_check
    CHECK (num_nonnulls(tenant_user_id, tenant_contact_id) = 1)
);

-- One attendance record per person per event.
CREATE UNIQUE INDEX uq_teams_event_attendance_event_email
  ON public.teams_event_attendance (event_type, graph_event_id, normalised_email);

CREATE INDEX idx_teams_event_attendance_event
  ON public.teams_event_attendance (event_type, graph_event_id);

ALTER TABLE public.teams_event_attendance ENABLE ROW LEVEL SECURITY;

CREATE POLICY "teams_event_attendance_select" ON public.teams_event_attendance
  FOR SELECT TO authenticated
  USING (
    public.is_super_admin_safe((SELECT auth.uid()))
    OR public.check_permission((SELECT auth.uid()), 'teams_events.manage_registrations', 'full')
  );

REVOKE ALL ON public.teams_event_attendance FROM anon, authenticated;
GRANT SELECT ON public.teams_event_attendance TO authenticated;
GRANT ALL ON public.teams_event_attendance TO service_role;
