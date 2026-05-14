-- Migrate notification_status enum to dd_notification_status lookup table.
-- Enum is retained for rollback safety.

-- 1. Create dd_notification_status table
CREATE TABLE public.dd_notification_status (
  id          serial       NOT NULL,
  value       text         NOT NULL,
  label       text         NOT NULL,
  sort_order  integer      NOT NULL DEFAULT 0,
  is_active   boolean      NOT NULL DEFAULT true,
  created_at  timestamptz  NOT NULL DEFAULT now(),
  CONSTRAINT dd_notification_status_pkey PRIMARY KEY (id),
  CONSTRAINT dd_notification_status_value_key UNIQUE (value)
);

-- 2. Seed rows (values byte-identical to enum labels)
INSERT INTO public.dd_notification_status (value, label, sort_order) VALUES
  ('queued',  'Queued',  1),
  ('sent',    'Sent',    2),
  ('failed',  'Failed',  3),
  ('skipped', 'Skipped', 4);

-- 3. Enable RLS
ALTER TABLE public.dd_notification_status ENABLE ROW LEVEL SECURITY;

CREATE POLICY dd_notification_status_select
  ON public.dd_notification_status FOR SELECT TO authenticated
  USING (true);

-- 4. Drop enum-typed partial indexes BEFORE altering column type
--    (their WHERE clauses reference the enum and would fail rebuild)
DROP INDEX public.idx_notification_outbox_status;
DROP INDEX public.idx_notification_outbox_next_retry;

-- 5. Change column type from enum to text, reset default
ALTER TABLE public.notification_outbox
  ALTER COLUMN status DROP DEFAULT;

ALTER TABLE public.notification_outbox
  ALTER COLUMN status TYPE text USING status::text;

ALTER TABLE public.notification_outbox
  ALTER COLUMN status SET DEFAULT 'queued';

-- 6. Add FK to dd_notification_status
ALTER TABLE public.notification_outbox
  ADD CONSTRAINT notification_outbox_status_fk
  FOREIGN KEY (status) REFERENCES public.dd_notification_status(value);

-- 7. Recreate indexes as plain text (no enum cast)
CREATE INDEX idx_notification_outbox_status
  ON public.notification_outbox USING btree (status)
  WHERE (status = 'queued');

CREATE INDEX idx_notification_outbox_next_retry
  ON public.notification_outbox USING btree (next_retry_at)
  WHERE (status = 'queued');

-- 8. Retain legacy enum with retention notice
COMMENT ON TYPE public.notification_status IS
  'Retained for rollback safety. Do not drop until Phase 3C (notification_delivery_target) and Phase 3D (notification_integration_status) are complete and verified.';