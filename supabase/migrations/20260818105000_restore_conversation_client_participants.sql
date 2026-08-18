-- Staff can create a client conversation only after resolving its tenant users.
-- The prior tenant_users SELECT policies accepted is_vivacity_staff but not the
-- is_vivacity_team_safe predicate used by the communications screen, so some
-- staff sessions saw an empty recipient set and created staff-only threads.

CREATE POLICY "tenant_users_select_vivacity_team_safe"
ON public.tenant_users
FOR SELECT
TO authenticated
USING (is_vivacity_team_safe(auth.uid()));

-- Repair staff-originated threads that were created without their tenant's
-- users. This restores access to already-delivered message content and makes
-- their first open eligible for the normal read-activity RPC.
INSERT INTO public.conversation_participants (conversation_id, user_id, role)
SELECT conversation.id, tenant_user.user_id, 'client'
FROM public.tenant_conversations AS conversation
JOIN public.tenant_users AS tenant_user
  ON tenant_user.tenant_id = conversation.tenant_id
JOIN auth.users AS auth_user
  ON auth_user.id = tenant_user.user_id
LEFT JOIN public.conversation_participants AS participant
  ON participant.conversation_id = conversation.id
 AND participant.user_id = tenant_user.user_id
WHERE participant.user_id IS NULL
  AND EXISTS (
    SELECT 1
    FROM public.conversation_participants AS staff_participant
    WHERE staff_participant.conversation_id = conversation.id
      AND staff_participant.role IN ('staff', 'csc')
  )
ON CONFLICT (conversation_id, user_id) DO NOTHING;
