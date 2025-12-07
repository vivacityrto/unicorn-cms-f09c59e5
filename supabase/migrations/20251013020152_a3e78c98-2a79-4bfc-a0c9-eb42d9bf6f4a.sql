-- First, add new values to user_type_enum in a separate transaction
ALTER TYPE user_type_enum ADD VALUE IF NOT EXISTS 'Client Parent';
ALTER TYPE user_type_enum ADD VALUE IF NOT EXISTS 'Client Child';