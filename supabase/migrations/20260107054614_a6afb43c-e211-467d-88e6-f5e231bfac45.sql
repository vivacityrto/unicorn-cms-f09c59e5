-- =============================================
-- Phase 1: Client Management Tables
-- =============================================

-- 1. Client Timeline Events (append-only activity feed)
CREATE TABLE public.client_timeline_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id integer NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  client_id text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid NULL,
  source text NOT NULL CHECK (source IN ('system', 'user')),
  event_type text NOT NULL,
  title text NOT NULL,
  body text NULL,
  entity_type text NULL,
  entity_id text NULL,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb
);

-- Indexes for timeline
CREATE INDEX idx_client_timeline_tenant_client_time 
  ON public.client_timeline_events (tenant_id, client_id, created_at DESC);
CREATE INDEX idx_client_timeline_entity 
  ON public.client_timeline_events (tenant_id, entity_type, entity_id);

-- RLS for timeline
ALTER TABLE public.client_timeline_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view timeline for their tenant"
  ON public.client_timeline_events FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.users u 
      WHERE u.user_uuid = auth.uid() 
      AND u.tenant_id = client_timeline_events.tenant_id
    )
    OR EXISTS (
      SELECT 1 FROM public.users u 
      WHERE u.user_uuid = auth.uid() 
      AND u.unicorn_role IN ('Super Admin', 'Team Leader')
    )
  );

CREATE POLICY "Users can insert timeline events for their tenant"
  ON public.client_timeline_events FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.users u 
      WHERE u.user_uuid = auth.uid() 
      AND u.tenant_id = client_timeline_events.tenant_id
    )
    OR EXISTS (
      SELECT 1 FROM public.users u 
      WHERE u.user_uuid = auth.uid() 
      AND u.unicorn_role IN ('Super Admin', 'Team Leader')
    )
  );

-- 2. Client Notes (structured, typed, taggable)
CREATE TABLE public.client_notes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id integer NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  client_id text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid NOT NULL,
  note_type text NOT NULL CHECK (note_type IN ('meeting', 'decision', 'risk', 'follow_up', 'escalation', 'general')),
  title text NULL,
  content text NOT NULL,
  tags text[] NOT NULL DEFAULT '{}'::text[],
  related_entity_type text NULL,
  related_entity_id text NULL,
  is_pinned boolean NOT NULL DEFAULT false
);

-- Indexes for notes
CREATE INDEX idx_client_notes_tenant_client_time 
  ON public.client_notes (tenant_id, client_id, created_at DESC);
CREATE INDEX idx_client_notes_type 
  ON public.client_notes (tenant_id, note_type);
CREATE INDEX idx_client_notes_tags 
  ON public.client_notes USING GIN (tags);

-- RLS for notes
ALTER TABLE public.client_notes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view notes for their tenant"
  ON public.client_notes FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.users u 
      WHERE u.user_uuid = auth.uid() 
      AND u.tenant_id = client_notes.tenant_id
    )
    OR EXISTS (
      SELECT 1 FROM public.users u 
      WHERE u.user_uuid = auth.uid() 
      AND u.unicorn_role IN ('Super Admin', 'Team Leader')
    )
  );

CREATE POLICY "Users can insert notes for their tenant"
  ON public.client_notes FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.users u 
      WHERE u.user_uuid = auth.uid() 
      AND u.tenant_id = client_notes.tenant_id
    )
    OR EXISTS (
      SELECT 1 FROM public.users u 
      WHERE u.user_uuid = auth.uid() 
      AND u.unicorn_role IN ('Super Admin', 'Team Leader')
    )
  );

CREATE POLICY "Users can update notes for their tenant"
  ON public.client_notes FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM public.users u 
      WHERE u.user_uuid = auth.uid() 
      AND u.tenant_id = client_notes.tenant_id
    )
    OR EXISTS (
      SELECT 1 FROM public.users u 
      WHERE u.user_uuid = auth.uid() 
      AND u.unicorn_role IN ('Super Admin', 'Team Leader')
    )
  );

CREATE POLICY "Users can delete notes for their tenant"
  ON public.client_notes FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM public.users u 
      WHERE u.user_uuid = auth.uid() 
      AND u.tenant_id = client_notes.tenant_id
    )
    OR EXISTS (
      SELECT 1 FROM public.users u 
      WHERE u.user_uuid = auth.uid() 
      AND u.unicorn_role IN ('Super Admin', 'Team Leader')
    )
  );

-- 3. Client Action Items
CREATE TABLE public.client_action_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id integer NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  client_id text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid NOT NULL,
  title text NOT NULL,
  description text NULL,
  owner_user_id uuid NULL,
  due_date date NULL,
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'in_progress', 'blocked', 'done', 'cancelled')),
  priority text NOT NULL DEFAULT 'normal' CHECK (priority IN ('low', 'normal', 'high', 'urgent')),
  source text NOT NULL DEFAULT 'manual' CHECK (source IN ('manual', 'note', 'stage_rule', 'system')),
  source_note_id uuid NULL REFERENCES public.client_notes(id) ON DELETE SET NULL,
  related_entity_type text NULL,
  related_entity_id text NULL,
  recurrence_rule text NULL,
  completed_at timestamptz NULL,
  completed_by uuid NULL
);

-- Indexes for action items
CREATE INDEX idx_client_action_items_tenant_client_status 
  ON public.client_action_items (tenant_id, client_id, status, due_date);
CREATE INDEX idx_client_action_items_owner 
  ON public.client_action_items (tenant_id, owner_user_id, status, due_date);

-- RLS for action items
ALTER TABLE public.client_action_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view action items for their tenant"
  ON public.client_action_items FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.users u 
      WHERE u.user_uuid = auth.uid() 
      AND u.tenant_id = client_action_items.tenant_id
    )
    OR EXISTS (
      SELECT 1 FROM public.users u 
      WHERE u.user_uuid = auth.uid() 
      AND u.unicorn_role IN ('Super Admin', 'Team Leader')
    )
  );

CREATE POLICY "Users can insert action items for their tenant"
  ON public.client_action_items FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.users u 
      WHERE u.user_uuid = auth.uid() 
      AND u.tenant_id = client_action_items.tenant_id
    )
    OR EXISTS (
      SELECT 1 FROM public.users u 
      WHERE u.user_uuid = auth.uid() 
      AND u.unicorn_role IN ('Super Admin', 'Team Leader')
    )
  );

CREATE POLICY "Users can update action items for their tenant"
  ON public.client_action_items FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM public.users u 
      WHERE u.user_uuid = auth.uid() 
      AND u.tenant_id = client_action_items.tenant_id
    )
    OR EXISTS (
      SELECT 1 FROM public.users u 
      WHERE u.user_uuid = auth.uid() 
      AND u.unicorn_role IN ('Super Admin', 'Team Leader')
    )
  );

CREATE POLICY "Users can delete action items for their tenant"
  ON public.client_action_items FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM public.users u 
      WHERE u.user_uuid = auth.uid() 
      AND u.tenant_id = client_action_items.tenant_id
    )
    OR EXISTS (
      SELECT 1 FROM public.users u 
      WHERE u.user_uuid = auth.uid() 
      AND u.unicorn_role IN ('Super Admin', 'Team Leader')
    )
  );

-- Triggers for updated_at
CREATE TRIGGER update_client_notes_updated_at
  BEFORE UPDATE ON public.client_notes
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_client_action_items_updated_at
  BEFORE UPDATE ON public.client_action_items
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- =============================================
-- RPC Functions
-- =============================================

-- 1. Create Client Note
CREATE OR REPLACE FUNCTION public.rpc_create_client_note(
  p_tenant_id integer,
  p_client_id text,
  p_note_type text,
  p_title text,
  p_content text,
  p_tags text[] DEFAULT '{}',
  p_related_entity_type text DEFAULT NULL,
  p_related_entity_id text DEFAULT NULL,
  p_is_pinned boolean DEFAULT false
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_user_id uuid;
  v_note_id uuid;
  v_user_name text;
BEGIN
  -- Get current user
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Not authenticated');
  END IF;

  -- Validate note_type
  IF p_note_type NOT IN ('meeting', 'decision', 'risk', 'follow_up', 'escalation', 'general') THEN
    RETURN jsonb_build_object('success', false, 'error', 'Invalid note type');
  END IF;

  -- Validate content
  IF p_content IS NULL OR trim(p_content) = '' THEN
    RETURN jsonb_build_object('success', false, 'error', 'Content is required');
  END IF;

  -- Get user name for timeline
  SELECT COALESCE(first_name || ' ' || last_name, email) INTO v_user_name
  FROM public.users WHERE user_uuid = v_user_id;

  -- Insert note
  INSERT INTO public.client_notes (
    tenant_id, client_id, created_by, note_type, title, content, 
    tags, related_entity_type, related_entity_id, is_pinned
  ) VALUES (
    p_tenant_id, p_client_id, v_user_id, p_note_type, p_title, p_content,
    COALESCE(p_tags, '{}'), p_related_entity_type, p_related_entity_id, p_is_pinned
  )
  RETURNING id INTO v_note_id;

  -- Insert timeline event
  INSERT INTO public.client_timeline_events (
    tenant_id, client_id, created_by, source, event_type, title, body,
    entity_type, entity_id, metadata
  ) VALUES (
    p_tenant_id, p_client_id, v_user_id, 'user', 'note_created',
    COALESCE(p_title, 'New ' || p_note_type || ' note'),
    left(p_content, 200),
    'note', v_note_id::text,
    jsonb_build_object('note_type', p_note_type, 'created_by_name', v_user_name, 'tags', p_tags)
  );

  RETURN jsonb_build_object('success', true, 'note_id', v_note_id);
END;
$$;

-- 2. Update Client Note
CREATE OR REPLACE FUNCTION public.rpc_update_client_note(
  p_note_id uuid,
  p_updates jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_user_id uuid;
  v_note record;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Not authenticated');
  END IF;

  -- Get existing note
  SELECT * INTO v_note FROM public.client_notes WHERE id = p_note_id;
  IF v_note IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Note not found');
  END IF;

  -- Update allowed fields only
  UPDATE public.client_notes SET
    title = COALESCE(p_updates->>'title', title),
    content = COALESCE(p_updates->>'content', content),
    note_type = COALESCE(p_updates->>'note_type', note_type),
    is_pinned = COALESCE((p_updates->>'is_pinned')::boolean, is_pinned),
    tags = COALESCE(
      CASE WHEN p_updates ? 'tags' THEN ARRAY(SELECT jsonb_array_elements_text(p_updates->'tags')) ELSE NULL END,
      tags
    ),
    updated_at = now()
  WHERE id = p_note_id;

  -- Insert timeline event for update
  INSERT INTO public.client_timeline_events (
    tenant_id, client_id, created_by, source, event_type, title,
    entity_type, entity_id, metadata
  ) VALUES (
    v_note.tenant_id, v_note.client_id, v_user_id, 'user', 'note_updated',
    'Note updated',
    'note', p_note_id::text,
    jsonb_build_object('updated_fields', (SELECT array_agg(key) FROM jsonb_object_keys(p_updates) AS key))
  );

  RETURN jsonb_build_object('success', true);
END;
$$;

-- 3. Create Action Item
CREATE OR REPLACE FUNCTION public.rpc_create_action_item(
  p_tenant_id integer,
  p_client_id text,
  p_title text,
  p_description text DEFAULT NULL,
  p_owner_user_id uuid DEFAULT NULL,
  p_due_date date DEFAULT NULL,
  p_priority text DEFAULT 'normal',
  p_source text DEFAULT 'manual',
  p_source_note_id uuid DEFAULT NULL,
  p_related_entity_type text DEFAULT NULL,
  p_related_entity_id text DEFAULT NULL,
  p_recurrence_rule text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_user_id uuid;
  v_action_id uuid;
  v_user_name text;
  v_owner_name text;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Not authenticated');
  END IF;

  -- Validate title
  IF p_title IS NULL OR trim(p_title) = '' THEN
    RETURN jsonb_build_object('success', false, 'error', 'Title is required');
  END IF;

  -- Validate priority
  IF p_priority NOT IN ('low', 'normal', 'high', 'urgent') THEN
    RETURN jsonb_build_object('success', false, 'error', 'Invalid priority');
  END IF;

  -- Validate source
  IF p_source NOT IN ('manual', 'note', 'stage_rule', 'system') THEN
    RETURN jsonb_build_object('success', false, 'error', 'Invalid source');
  END IF;

  -- Get user names
  SELECT COALESCE(first_name || ' ' || last_name, email) INTO v_user_name
  FROM public.users WHERE user_uuid = v_user_id;

  IF p_owner_user_id IS NOT NULL THEN
    SELECT COALESCE(first_name || ' ' || last_name, email) INTO v_owner_name
    FROM public.users WHERE user_uuid = p_owner_user_id;
  END IF;

  -- Insert action item
  INSERT INTO public.client_action_items (
    tenant_id, client_id, created_by, title, description, owner_user_id,
    due_date, priority, source, source_note_id, related_entity_type,
    related_entity_id, recurrence_rule
  ) VALUES (
    p_tenant_id, p_client_id, v_user_id, p_title, p_description, p_owner_user_id,
    p_due_date, p_priority, p_source, p_source_note_id, p_related_entity_type,
    p_related_entity_id, p_recurrence_rule
  )
  RETURNING id INTO v_action_id;

  -- Insert timeline event
  INSERT INTO public.client_timeline_events (
    tenant_id, client_id, created_by, source, event_type, title, body,
    entity_type, entity_id, metadata
  ) VALUES (
    p_tenant_id, p_client_id, v_user_id, 'user', 'action_item_created',
    p_title,
    p_description,
    'action_item', v_action_id::text,
    jsonb_build_object(
      'priority', p_priority,
      'due_date', p_due_date,
      'owner_name', v_owner_name,
      'created_by_name', v_user_name,
      'source', p_source
    )
  );

  RETURN jsonb_build_object('success', true, 'action_item_id', v_action_id);
END;
$$;

-- 4. Set Action Item Status
CREATE OR REPLACE FUNCTION public.rpc_set_action_item_status(
  p_action_item_id uuid,
  p_status text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_user_id uuid;
  v_action record;
  v_user_name text;
  v_old_status text;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Not authenticated');
  END IF;

  -- Validate status
  IF p_status NOT IN ('open', 'in_progress', 'blocked', 'done', 'cancelled') THEN
    RETURN jsonb_build_object('success', false, 'error', 'Invalid status');
  END IF;

  -- Get existing action item
  SELECT * INTO v_action FROM public.client_action_items WHERE id = p_action_item_id;
  IF v_action IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Action item not found');
  END IF;

  v_old_status := v_action.status;

  -- Get user name
  SELECT COALESCE(first_name || ' ' || last_name, email) INTO v_user_name
  FROM public.users WHERE user_uuid = v_user_id;

  -- Update status
  UPDATE public.client_action_items SET
    status = p_status,
    completed_at = CASE WHEN p_status = 'done' THEN now() ELSE NULL END,
    completed_by = CASE WHEN p_status = 'done' THEN v_user_id ELSE NULL END,
    updated_at = now()
  WHERE id = p_action_item_id;

  -- Insert timeline event for completion
  IF p_status = 'done' AND v_old_status != 'done' THEN
    INSERT INTO public.client_timeline_events (
      tenant_id, client_id, created_by, source, event_type, title,
      entity_type, entity_id, metadata
    ) VALUES (
      v_action.tenant_id, v_action.client_id, v_user_id, 'user', 'action_item_completed',
      v_action.title || ' completed',
      'action_item', p_action_item_id::text,
      jsonb_build_object('completed_by_name', v_user_name, 'previous_status', v_old_status)
    );
  ELSIF v_old_status != p_status THEN
    -- Status change event
    INSERT INTO public.client_timeline_events (
      tenant_id, client_id, created_by, source, event_type, title,
      entity_type, entity_id, metadata
    ) VALUES (
      v_action.tenant_id, v_action.client_id, v_user_id, 'user', 'action_item_updated',
      'Action item status changed to ' || p_status,
      'action_item', p_action_item_id::text,
      jsonb_build_object('old_status', v_old_status, 'new_status', p_status, 'changed_by_name', v_user_name)
    );
  END IF;

  RETURN jsonb_build_object('success', true);
END;
$$;

-- Grant execute permissions
GRANT EXECUTE ON FUNCTION public.rpc_create_client_note TO authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_update_client_note TO authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_create_action_item TO authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_set_action_item_status TO authenticated;