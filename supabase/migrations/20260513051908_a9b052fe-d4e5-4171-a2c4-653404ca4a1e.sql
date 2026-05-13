-- Create dd_meeting_type lookup table (mirrors dd_accounting_system shape exactly)
CREATE TABLE IF NOT EXISTS public.dd_meeting_type (
  id          serial primary key,
  value       text not null unique,
  label       text not null,
  sort_order  integer not null default 0,
  is_active   boolean not null default true,
  created_at  timestamptz not null default now()
);

-- Seed canonical values (byte-identical to legacy meeting_type enum labels)
INSERT INTO public.dd_meeting_type (value, label, sort_order) VALUES
  ('level_10',  'Level 10',  1),
  ('quarterly', 'Quarterly', 2),
  ('annual',    'Annual',    3)
ON CONFLICT (value) DO NOTHING;

-- Enable RLS
ALTER TABLE public.dd_meeting_type ENABLE ROW LEVEL SECURITY;

-- Policies (match dd_accounting_system exactly)
CREATE POLICY dd_meeting_type_read
  ON public.dd_meeting_type
  FOR SELECT
  USING (true);

CREATE POLICY dd_meeting_type_admin
  ON public.dd_meeting_type
  FOR ALL
  USING (EXISTS (
    SELECT 1 FROM users
    WHERE users.user_uuid = auth.uid()
      AND users.unicorn_role = 'Super Admin'::unicorn_role
  ));

-- Legacy public.meeting_type enum is intentionally retained for rollback safety.

-- ROLLBACK: DROP TABLE public.dd_meeting_type;
