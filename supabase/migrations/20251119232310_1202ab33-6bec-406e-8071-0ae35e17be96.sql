-- Update tasks_tenants status column to have proper constraint
-- First, update any existing NULL or invalid statuses to 'not_started'
UPDATE tasks_tenants 
SET status = 'not_started' 
WHERE status IS NULL OR status NOT IN ('not_started', 'in_progress', 'completed', 'pending', 'extended', 'overdue');

-- Add a check constraint for valid status values
-- Note: 'overdue' is included as a valid status value even though it won't be in the dropdown
-- It will be set programmatically based on due date
ALTER TABLE tasks_tenants 
DROP CONSTRAINT IF EXISTS tasks_tenants_status_check;

ALTER TABLE tasks_tenants 
ADD CONSTRAINT tasks_tenants_status_check 
CHECK (status IN ('not_started', 'in_progress', 'completed', 'overdue', 'pending', 'extended'));

-- Update the default value for new records
ALTER TABLE tasks_tenants 
ALTER COLUMN status SET DEFAULT 'not_started';