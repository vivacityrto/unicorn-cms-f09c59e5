-- Add files column to emails table
ALTER TABLE public.emails 
ADD COLUMN IF NOT EXISTS files text[] DEFAULT '{}';

-- Create storage bucket for email files
INSERT INTO storage.buckets (id, name, public)
VALUES ('email-files', 'email-files', true)
ON CONFLICT (id) DO NOTHING;

-- Create storage policies for email files bucket
CREATE POLICY "Super Admins can manage email files"
ON storage.objects
FOR ALL
USING (bucket_id = 'email-files' AND (SELECT is_super_admin()))
WITH CHECK (bucket_id = 'email-files' AND (SELECT is_super_admin()));

CREATE POLICY "Authenticated users can view email files"
ON storage.objects
FOR SELECT
USING (bucket_id = 'email-files' AND auth.role() = 'authenticated');