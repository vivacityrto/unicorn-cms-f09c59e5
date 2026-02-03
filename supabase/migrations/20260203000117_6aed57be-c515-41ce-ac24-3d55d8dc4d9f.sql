-- Add escalation tracking and soft delete support to eos_issues
ALTER TABLE eos_issues 
ADD COLUMN IF NOT EXISTS escalated_at TIMESTAMP WITH TIME ZONE,
ADD COLUMN IF NOT EXISTS escalation_reason TEXT,
ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMP WITH TIME ZONE;

-- Add owner_user_id for explicit owner tracking (assigned_to already exists)
-- Add index for soft-delete filtering
CREATE INDEX IF NOT EXISTS idx_eos_issues_deleted_at ON eos_issues(deleted_at) WHERE deleted_at IS NULL;

-- Create trigger function to auto-set timestamps on status changes
CREATE OR REPLACE FUNCTION public.handle_eos_issue_status_change()
RETURNS TRIGGER AS $$
BEGIN
  -- Set resolved_at when status changes to Solved or Closed
  IF NEW.status IN ('Solved', 'Closed') AND (OLD.status IS DISTINCT FROM NEW.status) THEN
    NEW.resolved_at := NOW();
    NEW.resolved_by := auth.uid();
  END IF;
  
  -- Set escalated_at when status changes to Escalated
  IF NEW.status = 'Escalated' AND OLD.status != 'Escalated' THEN
    NEW.escalated_at := NOW();
  END IF;
  
  -- Always update updated_at
  NEW.updated_at := NOW();
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Create trigger for status change handling
DROP TRIGGER IF EXISTS eos_issue_status_change ON eos_issues;
CREATE TRIGGER eos_issue_status_change
  BEFORE UPDATE ON eos_issues
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_eos_issue_status_change();

-- Update RLS to exclude soft-deleted items for normal queries
-- First, drop existing SELECT policy and recreate with soft-delete filter
DROP POLICY IF EXISTS "eos_issues_select" ON eos_issues;
CREATE POLICY "eos_issues_select" ON eos_issues
  FOR SELECT USING (
    deleted_at IS NULL AND (
      is_staff() OR is_super_admin() OR (tenant_id = get_current_user_tenant())
    )
  );

-- Add comment for documentation
COMMENT ON COLUMN eos_issues.escalated_at IS 'Timestamp when this issue was escalated';
COMMENT ON COLUMN eos_issues.escalation_reason IS 'Reason provided for escalation';
COMMENT ON COLUMN eos_issues.deleted_at IS 'Soft delete timestamp - null means active';