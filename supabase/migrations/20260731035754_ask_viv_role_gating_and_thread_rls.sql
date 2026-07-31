-- =====================================================
-- Fix is_vivacity_staff() stale role list + widen
-- assistant_threads/assistant_messages RLS to match.
--
-- is_vivacity_staff() has read 'Super Admin','Team Leader','Team Member'
-- only since its introduction (20260217004131), silently excluding
-- Integrator/BGT/CSC/CET from every RLS policy built on top of it
-- (task_assignments, behavioural_prompts, clickup_tasks/clickup_tasksdb,
-- and others) — a canonical 7-role Vivacity-staff list has existed in
-- application code the whole time (src/lib/roles/vivacityRoles.ts,
-- supabase/functions/_shared/auth-helpers.ts) but was never mirrored here.
-- CREATE OR REPLACE retroactively fixes every policy that calls this
-- function without touching each policy definition individually.
-- =====================================================
CREATE OR REPLACE FUNCTION public.is_vivacity_staff(p_user uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.users u
    WHERE u.user_uuid = p_user
      AND u.unicorn_role IN ('Super Admin','Team Leader','Team Member','Integrator','BGT','CSC','CET')
  );
$$;

-- =====================================================
-- assistant_threads / assistant_messages: widen from
-- Super-Admin-only to all Vivacity staff, so Ask Viv's
-- Knowledge mode (which inserts these rows directly from
-- the browser under RLS) works for CSC/CET/Integrator/BGT
-- now that the function-level access checks allow them too.
-- =====================================================
DROP POLICY IF EXISTS "assistant_threads_superadmin_own" ON public.assistant_threads;

CREATE POLICY "assistant_threads_staff_own"
  ON public.assistant_threads
  FOR ALL
  TO authenticated
  USING (
    viewer_user_id = auth.uid()
    AND public.is_vivacity_staff(auth.uid())
  )
  WITH CHECK (
    viewer_user_id = auth.uid()
    AND public.is_vivacity_staff(auth.uid())
  );

DROP POLICY IF EXISTS "assistant_messages_via_thread" ON public.assistant_messages;

CREATE POLICY "assistant_messages_staff_via_thread"
  ON public.assistant_messages
  FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.assistant_threads t
      WHERE t.id = thread_id
      AND t.viewer_user_id = auth.uid()
      AND public.is_vivacity_staff(auth.uid())
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.assistant_threads t
      WHERE t.id = thread_id
      AND t.viewer_user_id = auth.uid()
      AND public.is_vivacity_staff(auth.uid())
    )
  );
