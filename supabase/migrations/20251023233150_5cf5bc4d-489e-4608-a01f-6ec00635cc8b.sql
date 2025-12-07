-- Add slug column to packages table
ALTER TABLE public.packages 
ADD COLUMN IF NOT EXISTS slug TEXT;

-- Create a unique index on slug to prevent duplicates
CREATE UNIQUE INDEX IF NOT EXISTS packages_slug_key ON public.packages(slug);