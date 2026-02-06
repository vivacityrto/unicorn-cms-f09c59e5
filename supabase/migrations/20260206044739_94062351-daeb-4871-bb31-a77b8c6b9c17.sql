-- Fix FK constraints to point to public.users(user_uuid) instead of auth.users(id)
-- This is required for PostgREST to discover relationships for joins

-- Drop the existing FK that points to auth.users
ALTER TABLE public.processes
DROP CONSTRAINT IF EXISTS processes_approved_by_fkey;

-- Add the correct FK pointing to public.users
ALTER TABLE public.processes
ADD CONSTRAINT processes_approved_by_fkey
FOREIGN KEY (approved_by) REFERENCES public.users(user_uuid);