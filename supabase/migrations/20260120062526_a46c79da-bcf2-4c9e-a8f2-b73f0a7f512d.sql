-- Update the eos_issue_status enum to include new statuses for Risks & Opportunities
ALTER TYPE eos_issue_status ADD VALUE IF NOT EXISTS 'In Review';
ALTER TYPE eos_issue_status ADD VALUE IF NOT EXISTS 'Actioning';
ALTER TYPE eos_issue_status ADD VALUE IF NOT EXISTS 'Escalated';
ALTER TYPE eos_issue_status ADD VALUE IF NOT EXISTS 'Closed';

-- Update category check constraint to include new categories (if exists)
-- First check existing category values and add defaults for eos_issues
COMMENT ON COLUMN eos_issues.item_type IS 'Type of item: risk or opportunity';
COMMENT ON COLUMN eos_issues.category IS 'Category: Delivery, Compliance, Financial, Capacity, Systems, Client, Strategic, Growth';
COMMENT ON COLUMN eos_issues.impact IS 'Impact level: Low, Medium, High, Critical';
COMMENT ON COLUMN eos_issues.outcome_note IS 'Required outcome note when closing the item';