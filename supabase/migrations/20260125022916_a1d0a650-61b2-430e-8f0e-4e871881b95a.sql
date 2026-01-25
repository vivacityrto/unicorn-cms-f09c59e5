-- Step 1.1: Add document_assurance_period column to public.packages
ALTER TABLE public.packages 
  ADD COLUMN IF NOT EXISTS document_assurance_period integer DEFAULT 0;