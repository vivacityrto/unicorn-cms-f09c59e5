-- Update RLS policies for eos_issues to include Vivacity staff
-- Drop existing restrictive policies and recreate with staff access

DROP POLICY IF EXISTS "eos_issues_select" ON public.eos_issues;
DROP POLICY IF EXISTS "eos_issues_insert" ON public.eos_issues;
DROP POLICY IF EXISTS "eos_issues_update" ON public.eos_issues;
DROP POLICY IF EXISTS "eos_issues_delete" ON public.eos_issues;

-- SELECT: Vivacity staff can see all issues, tenant users see their tenant's issues
CREATE POLICY "eos_issues_select" ON public.eos_issues
FOR SELECT USING (
  public.is_staff() 
  OR public.is_super_admin()
  OR tenant_id = public.get_current_user_tenant()
);

-- INSERT: Vivacity staff can create issues for any tenant, tenant users for their own
CREATE POLICY "eos_issues_insert" ON public.eos_issues
FOR INSERT WITH CHECK (
  public.is_staff()
  OR public.is_super_admin()
  OR tenant_id = public.get_current_user_tenant()
);

-- UPDATE: Vivacity staff can update any issue, tenant users update their own tenant's issues
CREATE POLICY "eos_issues_update" ON public.eos_issues
FOR UPDATE USING (
  public.is_staff()
  OR public.is_super_admin()
  OR tenant_id = public.get_current_user_tenant()
  OR assigned_to = auth.uid()
  OR created_by = auth.uid()
);

-- DELETE: Vivacity staff can delete any issue, tenant users delete their own tenant's issues
CREATE POLICY "eos_issues_delete" ON public.eos_issues
FOR DELETE USING (
  public.is_staff()
  OR public.is_super_admin()
  OR tenant_id = public.get_current_user_tenant()
);

-- Update RLS policies for eos_meetings to include Vivacity staff
DROP POLICY IF EXISTS "Meetings read access for authenticated users" ON public.eos_meetings;

-- SELECT: Vivacity staff can see all meetings
CREATE POLICY "Meetings read access for authenticated users" ON public.eos_meetings
FOR SELECT TO authenticated USING (
  public.is_staff()
  OR public.is_super_admin()
  OR tenant_id IN (
    SELECT tenant_id FROM public.users WHERE user_uuid = auth.uid()
  )
);

-- Also update eos_meeting_attendees to allow staff to view
DROP POLICY IF EXISTS "Attendees viewable by tenant members" ON public.eos_meeting_attendees;

CREATE POLICY "Attendees viewable by tenant members" ON public.eos_meeting_attendees
FOR SELECT USING (
  public.is_staff()
  OR public.is_super_admin()
  OR EXISTS (
    SELECT 1
    FROM eos_meetings m
    JOIN tenant_users tu ON tu.tenant_id = m.tenant_id
    WHERE m.id = eos_meeting_attendees.meeting_id
    AND tu.user_id = auth.uid()
  )
);