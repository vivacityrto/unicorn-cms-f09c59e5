-- M3-C rollback: restore the retired empty notification_schedule contract.
-- This is a schema-only restore; the legacy audit functions and queue worker
-- remain retired and are not recreated by this rollback.

CREATE TABLE IF NOT EXISTS public.notification_schedule (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id bigint NOT NULL,
  user_id uuid,
  entity_type text NOT NULL,
  entity_id uuid NOT NULL,
  notification_type text NOT NULL,
  scheduled_for timestamptz NOT NULL,
  status text DEFAULT 'pending'::text,
  sent_at timestamptz,
  error_message text,
  escalation_level integer DEFAULT 0,
  escalated_to uuid,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  CONSTRAINT notification_schedule_entity_type_check CHECK (entity_type = ANY (ARRAY['task'::text, 'meeting'::text, 'rock'::text, 'issue'::text])),
  CONSTRAINT notification_schedule_notification_type_check CHECK (notification_type = ANY (ARRAY['due_soon'::text, 'overdue'::text, 'reminder_24h'::text, 'reminder_10m'::text, 'offtrack'::text, 'assigned'::text])),
  CONSTRAINT notification_schedule_status_check CHECK (status = ANY (ARRAY['pending'::text, 'sent'::text, 'cancelled'::text, 'failed'::text])),
  CONSTRAINT notification_schedule_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE,
  CONSTRAINT notification_schedule_escalated_to_fkey FOREIGN KEY (escalated_to) REFERENCES auth.users(id)
);

CREATE INDEX IF NOT EXISTS idx_notification_schedule_entity ON public.notification_schedule (entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_notification_schedule_escalated_to ON public.notification_schedule (escalated_to);
CREATE INDEX IF NOT EXISTS idx_notification_schedule_pending ON public.notification_schedule (scheduled_for) WHERE status = 'pending'::text;
CREATE INDEX IF NOT EXISTS idx_notification_schedule_status ON public.notification_schedule (status);
CREATE INDEX IF NOT EXISTS idx_notification_schedule_user ON public.notification_schedule (user_id);

ALTER TABLE public.notification_schedule ENABLE ROW LEVEL SECURITY;

CREATE POLICY notification_schedule_select ON public.notification_schedule
  FOR SELECT TO public
  USING ((user_id = (SELECT auth.uid())) OR is_super_admin() OR is_vivacity_team_safe((SELECT auth.uid())));
CREATE POLICY notification_schedule_insert ON public.notification_schedule
  FOR INSERT TO authenticated
  WITH CHECK ((user_id = (SELECT auth.uid())) OR is_vivacity_team_safe((SELECT auth.uid())));
CREATE POLICY notification_schedule_update ON public.notification_schedule
  FOR UPDATE TO authenticated
  USING ((user_id = (SELECT auth.uid())) OR is_vivacity_team_safe((SELECT auth.uid())))
  WITH CHECK ((user_id = (SELECT auth.uid())) OR is_vivacity_team_safe((SELECT auth.uid())));
CREATE POLICY notification_schedule_delete ON public.notification_schedule
  FOR DELETE TO authenticated
  USING ((user_id = (SELECT auth.uid())) OR is_vivacity_team_safe((SELECT auth.uid())));

GRANT ALL ON TABLE public.notification_schedule TO anon, authenticated, service_role;
