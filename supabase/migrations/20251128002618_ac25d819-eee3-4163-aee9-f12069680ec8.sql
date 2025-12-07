-- Add created_by and created_at columns to emails table
ALTER TABLE public.emails 
ADD COLUMN IF NOT EXISTS created_by uuid REFERENCES auth.users(id),
ADD COLUMN IF NOT EXISTS created_at timestamp with time zone DEFAULT now();

-- Update existing rows to have current timestamp
UPDATE public.emails SET created_at = now() WHERE created_at IS NULL;