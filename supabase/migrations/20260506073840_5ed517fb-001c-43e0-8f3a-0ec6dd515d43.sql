CREATE OR REPLACE FUNCTION public.is_conversation_participant_safe(
  p_conversation_id uuid,
  p_user_id uuid
) RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.conversation_participants
    WHERE conversation_id = p_conversation_id
      AND user_id = p_user_id
  );
$$;

REVOKE ALL ON FUNCTION public.is_conversation_participant_safe(uuid, uuid) FROM public;
GRANT EXECUTE ON FUNCTION public.is_conversation_participant_safe(uuid, uuid) TO authenticated, service_role;

DROP POLICY IF EXISTS cp_select_member ON public.conversation_participants;
CREATE POLICY cp_select_member ON public.conversation_participants
FOR SELECT
USING (
  is_super_admin()
  OR is_vivacity_team_safe(auth.uid())
  OR user_id = auth.uid()
  OR public.is_conversation_participant_safe(conversation_id, auth.uid())
);

DROP POLICY IF EXISTS tm_select_participant ON public.tenant_messages;
CREATE POLICY tm_select_participant ON public.tenant_messages
FOR SELECT
USING (
  is_vivacity_team_safe(auth.uid())
  OR public.is_conversation_participant_safe(conversation_id, auth.uid())
);

DROP POLICY IF EXISTS tm_insert_tenant ON public.tenant_messages;
CREATE POLICY tm_insert_tenant ON public.tenant_messages
FOR INSERT
WITH CHECK (
  sender_user_uuid = auth.uid()
  AND has_tenant_access_safe(tenant_id, auth.uid())
  AND public.is_conversation_participant_safe(conversation_id, auth.uid())
);