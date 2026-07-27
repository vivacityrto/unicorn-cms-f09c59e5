-- The reminder dedupe log was keyed on (action_item_id, offset_days,
-- recipient_user_id) only, with no awareness of due_date. If a due date is
-- edited such that the same offset (e.g. "3 days before") becomes relevant a
-- second time for a genuinely different due date, the old log row silently
-- suppressed the resend. Add due_date to the dedupe key so a real due-date
-- change that crosses the same offset threshold again correctly re-fires.

ALTER TABLE public.client_action_item_reminder_log
  ADD COLUMN due_date date NOT NULL;

COMMENT ON COLUMN public.client_action_item_reminder_log.due_date IS
  'The due_date the action item had at the moment this reminder was sent — part of the dedupe key so a later, genuinely different due date crossing the same offset fires again.';

ALTER TABLE public.client_action_item_reminder_log
  DROP CONSTRAINT client_action_item_reminder_l_action_item_id_offset_days_re_key;

ALTER TABLE public.client_action_item_reminder_log
  ADD CONSTRAINT client_action_item_reminder_log_unique_send
    UNIQUE (action_item_id, offset_days, recipient_user_id, due_date);
