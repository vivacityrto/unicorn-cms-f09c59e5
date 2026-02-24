-- Add ComplyHub integration fields to tenants table
ALTER TABLE public.tenants
  ADD COLUMN IF NOT EXISTS complyhub_url text,
  ADD COLUMN IF NOT EXISTS complyhub_membership_tier text;