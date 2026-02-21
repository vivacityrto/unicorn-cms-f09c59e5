
-- Drop the broken SELECT policy
DROP POLICY IF EXISTS "Staff can view clickup comments" ON public.clickup_task_comments;

-- Recreate using the standard helper function
CREATE POLICY "Staff can view clickup comments"
  ON public.clickup_task_comments
  FOR SELECT
  USING (public.is_vivacity_staff(auth.uid()));
