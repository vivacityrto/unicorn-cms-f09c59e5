-- Add 'Vivacity Team' to the user_type enum (must be committed before use)
ALTER TYPE public.user_type_enum ADD VALUE IF NOT EXISTS 'Vivacity Team';