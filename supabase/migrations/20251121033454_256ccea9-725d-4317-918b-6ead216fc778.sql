-- Update all existing rto_tips to have Ian as creator
UPDATE rto_tips 
SET created_by = '384cf51f-87f5-479b-a9c4-a2293be84e3a'
WHERE created_by IS NULL;

-- Drop RLS policies that depend on tenant_id
DROP POLICY IF EXISTS rto_tips_select ON rto_tips;
DROP POLICY IF EXISTS rto_tips_insert ON rto_tips;
DROP POLICY IF EXISTS rto_tips_update ON rto_tips;
DROP POLICY IF EXISTS rto_tips_delete ON rto_tips;

-- Drop the tenant_id column from rto_tips
ALTER TABLE rto_tips DROP COLUMN IF EXISTS tenant_id;

-- Recreate RLS policies without tenant_id
CREATE POLICY rto_tips_select ON rto_tips
  FOR SELECT
  USING (true);

CREATE POLICY rto_tips_insert ON rto_tips
  FOR INSERT
  WITH CHECK (created_by = auth.uid());

CREATE POLICY rto_tips_update ON rto_tips
  FOR UPDATE
  USING (created_by = auth.uid());

CREATE POLICY rto_tips_delete ON rto_tips
  FOR DELETE
  USING (created_by = auth.uid());