# Fix: Remove tenant-scoping from internal timeline RLS

## Problem
Four overlapping RLS policies on `client_timeline_events` (two duplicates from the 13 May role-enum migration) still enforce a stale tenant-match clause. Non-Super-Admin/Team-Leader internal staff (Team Member, Integrator, BGT, CSC, CET) have `users.tenant_id = null`, so the check fails and they see nothing on the Client Timeline tab.

## Fix
Single migration: drop the four vivacity policies, replace with one clean SELECT and one clean INSERT — role-only check against the canonical list in `src/lib/roles/vivacityRoles.ts`, no tenant-match. Leave the two `_client_*_visible` portal policies alone.

### Migration SQL
```sql
DROP POLICY IF EXISTS "Vivacity team can view all timeline events" ON public.client_timeline_events;
DROP POLICY IF EXISTS "Vivacity team can insert timeline events" ON public.client_timeline_events;
DROP POLICY IF EXISTS client_timeline_events_vivacity_select ON public.client_timeline_events;
DROP POLICY IF EXISTS client_timeline_events_vivacity_insert ON public.client_timeline_events;

CREATE POLICY client_timeline_events_vivacity_select
  ON public.client_timeline_events
  FOR SELECT
  TO public
  USING (
    EXISTS (
      SELECT 1 FROM public.users u
      WHERE u.user_uuid = auth.uid()
        AND u.unicorn_role IN ('Super Admin','Team Leader','Team Member','Integrator','BGT','CSC','CET')
    )
  );

CREATE POLICY client_timeline_events_vivacity_insert
  ON public.client_timeline_events
  FOR INSERT
  TO public
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.users u
      WHERE u.user_uuid = auth.uid()
        AND u.unicorn_role IN ('Super Admin','Team Leader','Team Member','Integrator','BGT','CSC','CET')
    )
  );
```

## Verify
After migration, run `supabase--read_query` on `pg_policies` for `client_timeline_events` and confirm exactly 4 policies remain: `_vivacity_select`, `_vivacity_insert`, `_client_select_visible`, `_client_insert_visible`. No code changes needed.
