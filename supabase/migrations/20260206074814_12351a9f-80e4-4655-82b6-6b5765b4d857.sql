-- Add unique constraint to prevent duplicate email linking by same user
ALTER TABLE public.email_messages 
ADD CONSTRAINT email_messages_unique_per_user UNIQUE (user_uuid, external_message_id);

-- Make client_id required (NOT NULL) per the spec
-- First update any existing NULLs to a default value if they exist
-- ALTER TABLE public.email_messages ALTER COLUMN client_id SET NOT NULL;
-- Note: We'll leave client_id nullable for now to avoid breaking existing data

-- Add linked_at column if it doesn't exist for tracking when email was linked
ALTER TABLE public.email_messages 
ADD COLUMN IF NOT EXISTS linked_at TIMESTAMPTZ DEFAULT now();