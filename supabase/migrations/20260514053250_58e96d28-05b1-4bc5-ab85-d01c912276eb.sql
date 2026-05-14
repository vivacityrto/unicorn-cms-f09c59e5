-- Phase 1: Create dd_notification_event lookup table, seed 10 values, enable RLS
-- Mirrors the dd_accounting_system shape (serial id, no updated_at)

CREATE TABLE public.dd_notification_event (
  id          serial      NOT NULL PRIMARY KEY,
  value       text        NOT NULL UNIQUE,
  label       text        NOT NULL,
  sort_order  integer     NOT NULL DEFAULT 0,
  is_active   boolean     NOT NULL DEFAULT true,
  created_at  timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.dd_notification_event IS
  'Lookup table for notification event types. Seeded from legacy public.notification_event_type enum. value column is the FK target for notification_rules / notification_outbox / notification_audit_log.';

-- Seed all 10 enum labels byte-identical
INSERT INTO public.dd_notification_event (value, label, sort_order) VALUES
  ('task_assigned',             'Task Assigned',            1),
  ('task_overdue',              'Task Overdue',             2),
  ('risk_flagged',              'Risk Flagged',             3),
  ('package_threshold_80',      'Package Hours at 80%',     4),
  ('package_threshold_95',      'Package Hours at 95%',     5),
  ('package_threshold_100',     'Package Hours at 100%',    6),
  ('meeting_action_created',    'Meeting Action Created',   7),
  ('document_request_created',  'Document Request Created', 8),
  ('note_shared',               'Note Shared',              9),
  ('note_added',                'Note Added',              10);

-- Enable RLS (mirrors dd_accounting_system policy pattern)
ALTER TABLE public.dd_notification_event ENABLE ROW LEVEL SECURITY;

-- Read: any authenticated user (lookup data is non-sensitive; anon role excluded)
CREATE POLICY dd_notification_event_read
  ON public.dd_notification_event
  FOR SELECT
  TO authenticated
  USING (true);

-- Write: Super Admin only
CREATE POLICY dd_notification_event_admin
  ON public.dd_notification_event
  FOR ALL
  USING (
    EXISTS (
      SELECT 1
      FROM public.users
      WHERE users.user_uuid = (SELECT auth.uid())
        AND users.unicorn_role = 'Super Admin'::public.unicorn_role
    )
  );