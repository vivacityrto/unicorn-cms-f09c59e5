-- Feature: robust Action Item notify — internal staff list + tenant user list +
-- configurable due-date reminders (15/7/3/1 days before), replacing the old
-- single "Notify Client (Primary Contact)" checkbox + no-persistence design.

-- 1. Persist notify configuration directly on the action item.
ALTER TABLE public.client_action_items
  ADD COLUMN IF NOT EXISTS notify_staff_user_ids uuid[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS notify_tenant_user_ids uuid[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS notify_offset_days int[] NOT NULL DEFAULT '{}';

COMMENT ON COLUMN public.client_action_items.notify_staff_user_ids IS
  'Internal Vivacity staff to email (and in-app notify) about this action item.';
COMMENT ON COLUMN public.client_action_items.notify_tenant_user_ids IS
  'Tenant/client portal users to email about this action item. Replaces the old primary-contact-only checkbox.';
COMMENT ON COLUMN public.client_action_items.notify_offset_days IS
  'Days-before-due-date to send a reminder email, e.g. {15,3,1}. Subset of the fixed preset {15,7,3,1}.';

-- 2. Dedupe/audit log for reminder sends — one row per (item, offset, recipient)
--    sent, so the nightly scan never double-emails someone.
CREATE TABLE public.client_action_item_reminder_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  action_item_id uuid NOT NULL REFERENCES public.client_action_items(id) ON DELETE CASCADE,
  offset_days int NOT NULL,
  recipient_user_id uuid NOT NULL REFERENCES public.users(user_uuid),
  recipient_kind text NOT NULL CHECK (recipient_kind IN ('staff', 'tenant_user')),
  email text NOT NULL,
  sent_at timestamptz NOT NULL DEFAULT now(),
  mailgun_message_id text,
  UNIQUE (action_item_id, offset_days, recipient_user_id)
);

CREATE INDEX idx_cair_log_action_item ON public.client_action_item_reminder_log (action_item_id);

ALTER TABLE public.client_action_item_reminder_log ENABLE ROW LEVEL SECURITY;

-- Staff can view the reminder history; all writes come from the service-role
-- edge function (bypasses RLS), so no INSERT policy for authenticated users.
CREATE POLICY "cair_log_staff_select" ON public.client_action_item_reminder_log
  FOR SELECT
  USING (public.is_vivacity_team_safe(auth.uid()));

REVOKE ALL ON public.client_action_item_reminder_log FROM PUBLIC, anon;
GRANT SELECT ON public.client_action_item_reminder_log TO authenticated;
GRANT ALL ON public.client_action_item_reminder_log TO service_role;

-- 3. Nightly cron: scan for due reminders and dispatch emails via the new
--    edge function. Mirrors the existing process-notification-outbox /
--    run-tenant-risk-forecast pattern (verify_jwt = false, no in-function
--    caller check — trusted by not being a user-facing endpoint).
SELECT cron.schedule(
  'send-action-item-due-reminders-nightly',
  '0 20 * * *', -- ~06:00 AEST / 07:00 AEDT
  $$
    SELECT net.http_post(
      url := 'https://yxkgdalkbrriasiyyrwk.supabase.co/functions/v1/send-action-item-due-reminders',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || private.cron_function_jwt()
      ),
      body := '{}'::jsonb
    ) AS request_id;
  $$
);
