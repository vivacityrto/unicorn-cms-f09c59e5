-- Create team enum for Vivacity staff categorization
CREATE TYPE staff_team_type AS ENUM (
  'csc',           -- Client Success Champions
  'csc_admin',     -- CSC Admin Assistants
  'growth',        -- Business Growth Team
  'leadership',    -- Leadership/Executive
  'other'          -- Other staff
);

-- Add team column to users table
ALTER TABLE public.users ADD COLUMN staff_team staff_team_type;

-- Update Client Success Champions
UPDATE public.users SET staff_team = 'csc' 
WHERE email IN ('sam@vivacity.com.au', 'sharwari@vivacity.com.au', 'kelly@vivacity.com.au', 'angela@vivacity.com.au');

-- Update CSC Admin Assistants
UPDATE public.users SET staff_team = 'csc_admin' 
WHERE email IN ('may@vivacity.com.au', 'jomar@vivacity.com.au', 'jose@vivacity.com.au');

-- Update Business Growth Team
UPDATE public.users SET staff_team = 'growth' 
WHERE email IN ('dave@vivacity.com.au', 'carlo@vivacity.com.au', 'jonathan@vivacity.com.au', 'ian@vivacity.com.au', 'albert@vivacity.com.au', 'rhald@vivacity.com.au');

-- Add index for filtering by team
CREATE INDEX idx_users_staff_team ON public.users(staff_team) WHERE staff_team IS NOT NULL;