
-- Step 1: Drop dependent views first (they reference client_reminders_feed)
DROP VIEW IF EXISTS public.my_client_reminders;
DROP VIEW IF EXISTS public.tenant_client_reminders;

-- Step 2: Recreate client_reminders_feed with security_invoker and attendee expansion
CREATE OR REPLACE VIEW public.client_reminders_feed
WITH (security_invoker = true) AS

-- Tasks
SELECT
  'task'::text AS item_type,
  tt.id::text AS item_id,
  tt.tenant_id,
  tt.task_name AS title,
  tt.due_date::timestamptz AS starts_at,
  NULL::timestamptz AS ends_at,
  tt.created_by AS owner_user_id,
  jsonb_build_object(
    'status', tt.status,
    'completed', tt.completed,
    'package_id', tt.package_id,
    'stage_id', tt.stage_id,
    'source', 'tasks_tenants'
  ) AS meta
FROM public.tasks_tenants tt
WHERE tt.due_date IS NOT NULL

UNION ALL

-- Meetings: owner row
SELECT
  'meeting'::text AS item_type,
  m.id::text AS item_id,
  m.tenant_id,
  m.title,
  m.starts_at,
  m.ends_at,
  m.owner_user_uuid AS owner_user_id,
  jsonb_build_object(
    'location', m.location,
    'meeting_url', m.external_meeting_url,
    'package_id', m.package_id,
    'client_id', m.client_id,
    'role', 'owner',
    'source', 'meetings'
  ) AS meta
FROM public.meetings m
WHERE m.starts_at IS NOT NULL

UNION ALL

-- Meetings: attendee rows (matched via email → users)
SELECT
  'meeting'::text AS item_type,
  m.id::text AS item_id,
  m.tenant_id,
  m.title,
  m.starts_at,
  m.ends_at,
  u.user_uuid AS owner_user_id,
  jsonb_build_object(
    'location', m.location,
    'meeting_url', m.external_meeting_url,
    'package_id', m.package_id,
    'client_id', m.client_id,
    'role', 'attendee',
    'source', 'meetings'
  ) AS meta
FROM public.meetings m
JOIN public.meeting_participants mp ON mp.meeting_id = m.id
JOIN public.users u ON lower(u.email) = lower(mp.participant_email)
WHERE m.starts_at IS NOT NULL
  AND u.user_uuid IS DISTINCT FROM m.owner_user_uuid

UNION ALL

-- Calendar entry reminders
SELECT
  'reminder'::text AS item_type,
  ce.id::text AS item_id,
  ce.tenant_id,
  ce.title,
  (ce.entry_date + COALESCE(ce.entry_time, '00:00'::time))::timestamptz AS starts_at,
  NULL::timestamptz AS ends_at,
  ce.created_by AS owner_user_id,
  jsonb_build_object(
    'description', ce.description,
    'source', 'calendar_entries'
  ) AS meta
FROM public.calendar_entries ce
WHERE ce.entry_date IS NOT NULL;

-- Step 3: Recreate my_client_reminders with security_invoker
CREATE OR REPLACE VIEW public.my_client_reminders
WITH (security_invoker = true) AS
SELECT *
FROM public.client_reminders_feed
WHERE tenant_id IN (
  SELECT tu.tenant_id FROM public.tenant_users tu WHERE tu.user_id = auth.uid()
)
AND owner_user_id = auth.uid();

-- Step 4: Recreate tenant_client_reminders with security_invoker
CREATE OR REPLACE VIEW public.tenant_client_reminders
WITH (security_invoker = true) AS
SELECT *
FROM public.client_reminders_feed
WHERE tenant_id IN (
  SELECT tu.tenant_id FROM public.tenant_users tu WHERE tu.user_id = auth.uid()
);

-- Step 5: Add composite index for meetings performance
CREATE INDEX IF NOT EXISTS idx_meetings_tenant_starts_at
  ON public.meetings (tenant_id, starts_at);
