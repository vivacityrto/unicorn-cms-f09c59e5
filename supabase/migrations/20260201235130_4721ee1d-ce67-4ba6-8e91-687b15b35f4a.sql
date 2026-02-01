-- Update staff_team_type enum with new team values
-- First create the new enum type
CREATE TYPE staff_team_type_new AS ENUM (
  'none',
  'business_growth',
  'client_success',
  'client_experience',
  'software_development',
  'leadership'
);

-- Update existing values to NULL before changing type
UPDATE public.users SET staff_team = NULL WHERE staff_team IS NOT NULL;

-- Change users table column to new type
ALTER TABLE public.users ALTER COLUMN staff_team TYPE staff_team_type_new USING NULL;

-- Also update backup_users table if it exists
ALTER TABLE public.backup_users ALTER COLUMN staff_team TYPE staff_team_type_new USING NULL;

-- Now we can drop the old enum and rename
DROP TYPE IF EXISTS staff_team_type;
ALTER TYPE staff_team_type_new RENAME TO staff_team_type;