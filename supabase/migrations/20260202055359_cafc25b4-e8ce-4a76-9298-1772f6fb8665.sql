-- Fix infinite recursion in RLS policies for EOS meeting tables
-- These policies were querying tenant_users directly, which has self-referential policies
-- Solution: Use user_has_tenant_access() SECURITY DEFINER function instead

-- 1. Fix eos_meeting_attendees SELECT policy
DROP POLICY IF EXISTS "Attendees viewable by tenant members" ON eos_meeting_attendees;
CREATE POLICY "Attendees viewable by tenant members"
ON eos_meeting_attendees FOR SELECT
USING (
  is_staff() OR is_super_admin() OR (
    EXISTS (
      SELECT 1 FROM eos_meetings m
      WHERE m.id = eos_meeting_attendees.meeting_id
        AND user_has_tenant_access(m.tenant_id)
    )
  )
);

-- 2. Fix eos_meeting_attendees write policies  
DROP POLICY IF EXISTS "Attendees manageable by meeting owner or admin" ON eos_meeting_attendees;
CREATE POLICY "Attendees manageable by meeting owner or admin"
ON eos_meeting_attendees FOR ALL
USING (
  is_super_admin() OR (
    EXISTS (
      SELECT 1 FROM eos_meetings m
      WHERE m.id = eos_meeting_attendees.meeting_id
        AND (m.created_by = auth.uid() OR can_facilitate_eos(auth.uid(), m.tenant_id))
    )
  )
);

-- 3. Fix eos_meeting_outcome_confirmations SELECT policy
DROP POLICY IF EXISTS "Users can view outcome confirmations for their tenant" ON eos_meeting_outcome_confirmations;
CREATE POLICY "Users can view outcome confirmations for their tenant"
ON eos_meeting_outcome_confirmations FOR SELECT
USING (
  user_has_tenant_access(tenant_id) OR is_super_admin()
);

-- 4. Fix eos_meeting_outcome_confirmations INSERT policy
DROP POLICY IF EXISTS "Users can insert outcome confirmations for their tenant" ON eos_meeting_outcome_confirmations;
CREATE POLICY "Users can insert outcome confirmations for their tenant"
ON eos_meeting_outcome_confirmations FOR INSERT
WITH CHECK (
  user_has_tenant_access(tenant_id)
);