-- Add staff_teams array column to users table for multi-team assignment
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS staff_teams text[] DEFAULT '{}';

-- Migrate existing staff_team values to the new array column
UPDATE public.users 
SET staff_teams = ARRAY[staff_team::text] 
WHERE staff_team IS NOT NULL AND staff_team != 'none' AND (staff_teams IS NULL OR staff_teams = '{}');

-- Add comment for documentation
COMMENT ON COLUMN public.users.staff_teams IS 'Array of staff team assignments. Valid values: business_growth, client_success, client_experience, software_development, leadership';