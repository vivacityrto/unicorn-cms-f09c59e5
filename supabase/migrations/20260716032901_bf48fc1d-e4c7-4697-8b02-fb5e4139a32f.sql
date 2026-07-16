ALTER TABLE public.notes ADD COLUMN IF NOT EXISTS source_email_id uuid;
CREATE INDEX IF NOT EXISTS idx_notes_source_email_id ON public.notes(source_email_id) WHERE source_email_id IS NOT NULL;

-- Security: prevent privilege escalation via profiles table
CREATE POLICY "profiles_no_privilege_escalation"
ON public.profiles
AS RESTRICTIVE
FOR UPDATE
TO authenticated
USING (true)
WITH CHECK (
  (role IS NOT DISTINCT FROM (SELECT p.role FROM public.profiles p WHERE p.id = profiles.id))
  AND (global_role IS NOT DISTINCT FROM (SELECT p.global_role FROM public.profiles p WHERE p.id = profiles.id))
  AND (user_id IS NOT DISTINCT FROM (SELECT p.user_id FROM public.profiles p WHERE p.id = profiles.id))
);