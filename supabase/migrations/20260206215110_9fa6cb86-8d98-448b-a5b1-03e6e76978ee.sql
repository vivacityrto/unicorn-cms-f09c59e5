-- Standardize RLS policies for email_message_attachments table
-- Replaces legacy functions with recursion-safe helpers

-- 1. Drop existing legacy policies
DROP POLICY IF EXISTS "email_msg_attachments_select_own" ON public.email_message_attachments;
DROP POLICY IF EXISTS "email_msg_attachments_select_superadmin" ON public.email_message_attachments;
DROP POLICY IF EXISTS "email_msg_attachments_insert_own" ON public.email_message_attachments;

-- 2. Create standardized SELECT policy (owner via parent OR SuperAdmin)
CREATE POLICY "email_message_attachments_select"
ON public.email_message_attachments
FOR SELECT TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.email_messages em
    WHERE em.id = email_message_attachments.email_message_id
      AND em.user_uuid = auth.uid()
  )
  OR public.is_super_admin_safe(auth.uid())
);

-- 3. Create standardized INSERT policy (owner via parent only)
CREATE POLICY "email_message_attachments_insert"
ON public.email_message_attachments
FOR INSERT TO authenticated
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.email_messages em
    WHERE em.id = email_message_attachments.email_message_id
      AND em.user_uuid = auth.uid()
  )
);

-- 4. Create standardized UPDATE policy (SuperAdmin only)
CREATE POLICY "email_message_attachments_update"
ON public.email_message_attachments
FOR UPDATE TO authenticated
USING (public.is_super_admin_safe(auth.uid()))
WITH CHECK (public.is_super_admin_safe(auth.uid()));

-- 5. Create standardized DELETE policy (SuperAdmin only)
CREATE POLICY "email_message_attachments_delete"
ON public.email_message_attachments
FOR DELETE TO authenticated
USING (public.is_super_admin_safe(auth.uid()));