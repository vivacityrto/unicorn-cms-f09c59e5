SET LOCAL lock_timeout = '3s';
SET LOCAL statement_timeout = '60s';

-- 1. help_threads.metadata
ALTER TABLE public.help_threads
  ADD COLUMN IF NOT EXISTS metadata jsonb;

-- 1b. user_notifications.metadata (required for trigger payload)
ALTER TABLE public.user_notifications
  ADD COLUMN IF NOT EXISTS metadata jsonb;

-- 2. Storage bucket: support-attachments
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'support-attachments',
  'support-attachments',
  true,
  5242880,
  ARRAY['image/jpeg','image/png','image/gif','image/webp','image/svg+xml','image/bmp','image/tiff']
)
ON CONFLICT (id) DO UPDATE
  SET public = EXCLUDED.public,
      file_size_limit = EXCLUDED.file_size_limit,
      allowed_mime_types = EXCLUDED.allowed_mime_types;

DROP POLICY IF EXISTS "support_attachments_select_authenticated" ON storage.objects;
CREATE POLICY "support_attachments_select_authenticated"
  ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'support-attachments');

DROP POLICY IF EXISTS "support_attachments_insert_authenticated" ON storage.objects;
CREATE POLICY "support_attachments_insert_authenticated"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'support-attachments' AND auth.uid() IS NOT NULL);

-- 3. Notify CSCs on new support thread
CREATE OR REPLACE FUNCTION public.fn_notify_csc_on_support_ticket()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.channel = 'support' THEN
    INSERT INTO public.user_notifications
      (user_id, tenant_id, type, title, message, metadata, source_id)
    SELECT
      u.user_uuid,
      NEW.tenant_id,
      'support_ticket',
      'New support ticket',
      'A client has submitted a support request.',
      jsonb_build_object(
        'thread_id', NEW.id,
        'tenant_id', NEW.tenant_id,
        'user_id',   NEW.user_id
      ),
      NEW.id::text
    FROM public.users u
    WHERE u.unicorn_role IN ('Super Admin','Team Leader','Team Member')
      AND u.email NOT LIKE '%+%'
      AND u.email LIKE '%@vivacity.com.au'
      AND u.user_uuid IS NOT NULL;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_notify_csc_on_support_ticket ON public.help_threads;
CREATE TRIGGER trg_notify_csc_on_support_ticket
AFTER INSERT ON public.help_threads
FOR EACH ROW EXECUTE FUNCTION public.fn_notify_csc_on_support_ticket();