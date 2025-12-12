-- Add columns for inspection submission data
ALTER TABLE public.audit 
ADD COLUMN IF NOT EXISTS action_title text,
ADD COLUMN IF NOT EXISTS doc_number text,
ADD COLUMN IF NOT EXISTS conducted_by uuid REFERENCES auth.users(id);