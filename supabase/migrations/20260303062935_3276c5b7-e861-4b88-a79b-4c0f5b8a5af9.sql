
-- Sprint 1: Communications Schema (final correct ordering)

-- STEP 1: Drop ALL policies that depend on legacy conversations table
-- On messages table
DROP POLICY IF EXISTS "messages_insert_access" ON public.messages;
DROP POLICY IF EXISTS "messages_select_access" ON public.messages;
-- On conversation_participants table
DROP POLICY IF EXISTS "cp_delete_access" ON public.conversation_participants;
DROP POLICY IF EXISTS "cp_insert_access" ON public.conversation_participants;
DROP POLICY IF EXISTS "cp_select_access" ON public.conversation_participants;
DROP POLICY IF EXISTS "conversation_participants_select" ON public.conversation_participants;
DROP POLICY IF EXISTS "conversation_participants_write" ON public.conversation_participants;
-- On conversations table itself
DROP POLICY IF EXISTS "conversations_delete_access" ON public.conversations;
DROP POLICY IF EXISTS "conversations_insert_access" ON public.conversations;
DROP POLICY IF EXISTS "conversations_select" ON public.conversations;
DROP POLICY IF EXISTS "conversations_select_access" ON public.conversations;
DROP POLICY IF EXISTS "conversations_update_access" ON public.conversations;
DROP POLICY IF EXISTS "conversations_write" ON public.conversations;

-- Also drop remaining messages policies (for tenant_id type change)
DROP POLICY IF EXISTS "Tenant members can read messages" ON public.messages;
DROP POLICY IF EXISTS "Users can insert messages for their tenant" ON public.messages;
DROP POLICY IF EXISTS "Users can update messages in their tenant" ON public.messages;
DROP POLICY IF EXISTS "Staff can read all messages" ON public.messages;
DROP POLICY IF EXISTS "messages_delete_access" ON public.messages;
DROP POLICY IF EXISTS "messages_insert" ON public.messages;
DROP POLICY IF EXISTS "messages_select" ON public.messages;
DROP POLICY IF EXISTS "messages_update_own" ON public.messages;

-- STEP 2: Drop FKs that reference legacy conversations
ALTER TABLE public.conversation_participants
  DROP CONSTRAINT IF EXISTS conversation_participants_conversation_id_fkey;
ALTER TABLE public.messages
  DROP CONSTRAINT IF EXISTS messages_tenant_id_fkey;

-- STEP 3: Drop legacy conversations table
DROP TABLE IF EXISTS public.conversations;

-- STEP 4: Alter messages.tenant_id to bigint
ALTER TABLE public.messages ALTER COLUMN tenant_id TYPE bigint;

-- STEP 5: Add new columns
ALTER TABLE public.tenant_conversations
  ADD COLUMN IF NOT EXISTS type text NOT NULL DEFAULT 'general',
  ADD COLUMN IF NOT EXISTS subject text,
  ADD COLUMN IF NOT EXISTS related_entity text,
  ADD COLUMN IF NOT EXISTS related_entity_id text,
  ADD COLUMN IF NOT EXISTS last_message_at timestamptz,
  ADD COLUMN IF NOT EXISTS last_message_preview text;

ALTER TABLE public.conversation_participants
  ADD COLUMN IF NOT EXISTS role text NOT NULL DEFAULT 'client',
  ADD COLUMN IF NOT EXISTS last_read_at timestamptz;

ALTER TABLE public.messages
  ADD COLUMN IF NOT EXISTS attachments jsonb;

-- STEP 6: Add FKs to tenant_conversations
ALTER TABLE public.conversation_participants
  ADD CONSTRAINT conversation_participants_conversation_id_fkey
  FOREIGN KEY (conversation_id) REFERENCES public.tenant_conversations(id) ON DELETE CASCADE;

ALTER TABLE public.messages
  ADD CONSTRAINT messages_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id);

ALTER TABLE public.messages
  ADD CONSTRAINT messages_conversation_id_fkey
  FOREIGN KEY (conversation_id) REFERENCES public.tenant_conversations(id) ON DELETE CASCADE;

-- STEP 7: Recreate RLS on messages
CREATE POLICY "messages_select_tenant"
  ON public.messages FOR SELECT
  USING (tenant_id IN (SELECT tu.tenant_id FROM public.tenant_users tu WHERE tu.user_id = auth.uid()));

CREATE POLICY "messages_select_staff"
  ON public.messages FOR SELECT
  USING (is_vivacity_team_safe(auth.uid()));

CREATE POLICY "messages_insert_participant"
  ON public.messages FOR INSERT
  WITH CHECK (
    is_super_admin()
    OR is_vivacity_team_safe(auth.uid())
    OR (sender_id = auth.uid() AND EXISTS (
      SELECT 1 FROM public.conversation_participants cp
      WHERE cp.conversation_id = messages.conversation_id AND cp.user_id = auth.uid()
    ))
  );

CREATE POLICY "messages_update_tenant"
  ON public.messages FOR UPDATE
  USING (
    tenant_id IN (SELECT tu.tenant_id FROM public.tenant_users tu WHERE tu.user_id = auth.uid())
    OR is_vivacity_team_safe(auth.uid())
  );

CREATE POLICY "messages_delete_own"
  ON public.messages FOR DELETE
  USING (is_super_admin() OR sender_id = auth.uid());

-- STEP 8: RLS on conversation_participants
CREATE POLICY "cp_select_member"
  ON public.conversation_participants FOR SELECT
  USING (
    is_super_admin()
    OR is_vivacity_team_safe(auth.uid())
    OR user_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.conversation_participants cp2
      WHERE cp2.conversation_id = conversation_participants.conversation_id AND cp2.user_id = auth.uid()
    )
  );

CREATE POLICY "cp_insert_auth"
  ON public.conversation_participants FOR INSERT
  WITH CHECK (
    is_super_admin()
    OR is_vivacity_team_safe(auth.uid())
    OR EXISTS (
      SELECT 1 FROM public.tenant_conversations tc
      WHERE tc.id = conversation_participants.conversation_id
        AND tc.tenant_id IN (SELECT tu.tenant_id FROM public.tenant_users tu WHERE tu.user_id = auth.uid())
    )
  );

CREATE POLICY "cp_delete_admin"
  ON public.conversation_participants FOR DELETE
  USING (
    is_super_admin()
    OR EXISTS (
      SELECT 1 FROM public.tenant_conversations tc
      WHERE tc.id = conversation_participants.conversation_id AND is_tenant_admin(tc.tenant_id)
    )
  );

CREATE POLICY "cp_update_own"
  ON public.conversation_participants FOR UPDATE
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- STEP 9: Update tenant_conversations RLS (keep existing select policies, replace insert/update)
DROP POLICY IF EXISTS "tc_insert_staff" ON public.tenant_conversations;
DROP POLICY IF EXISTS "tc_insert_tenant" ON public.tenant_conversations;
DROP POLICY IF EXISTS "tc_update_staff" ON public.tenant_conversations;

CREATE POLICY "tc_insert_auth"
  ON public.tenant_conversations FOR INSERT
  WITH CHECK (
    is_super_admin()
    OR is_vivacity_team_safe(auth.uid())
    OR (
      created_by_user_uuid = auth.uid()
      AND tenant_id IN (SELECT tu.tenant_id FROM public.tenant_users tu WHERE tu.user_id = auth.uid())
    )
  );

CREATE POLICY "tc_update_auth"
  ON public.tenant_conversations FOR UPDATE
  USING (
    is_super_admin()
    OR is_vivacity_team_safe(auth.uid())
    OR tenant_id IN (SELECT tu.tenant_id FROM public.tenant_users tu WHERE tu.user_id = auth.uid())
  );

-- STEP 10: Triggers
CREATE OR REPLACE FUNCTION public.fn_update_conversation_on_message()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  UPDATE public.tenant_conversations
  SET last_message_at = NEW.created_at, last_message_preview = LEFT(NEW.body, 100), updated_at = now()
  WHERE id = NEW.conversation_id;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_update_conversation_on_message
  AFTER INSERT ON public.messages FOR EACH ROW
  EXECUTE FUNCTION public.fn_update_conversation_on_message();

CREATE OR REPLACE FUNCTION public.fn_notify_conversation_participants()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _participant RECORD;
  _conv_subject text;
  _tenant_id bigint;
BEGIN
  SELECT subject, tenant_id INTO _conv_subject, _tenant_id
  FROM public.tenant_conversations WHERE id = NEW.conversation_id;

  FOR _participant IN
    SELECT user_id FROM public.conversation_participants
    WHERE conversation_id = NEW.conversation_id AND user_id != NEW.sender_id
  LOOP
    INSERT INTO public.user_notifications (user_id, tenant_id, type, title, message, link, is_read, created_by, created_at)
    VALUES (_participant.user_id, _tenant_id, 'message', COALESCE(_conv_subject, 'New message'), LEFT(NEW.body, 200), '/client/communications', false, NEW.sender_id, now());
  END LOOP;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_notify_conversation_participants
  AFTER INSERT ON public.messages FOR EACH ROW
  EXECUTE FUNCTION public.fn_notify_conversation_participants();
