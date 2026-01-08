-- Create RPC for toggling pin status
CREATE OR REPLACE FUNCTION public.rpc_toggle_client_note_pin(
  p_note_id uuid,
  p_is_pinned boolean
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_user_id uuid;
  v_note record;
  v_event_type text;
  v_title text;
BEGIN
  -- Get current user
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Not authenticated');
  END IF;

  -- Get the note
  SELECT * INTO v_note
  FROM public.client_notes
  WHERE id = p_note_id;
  
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Note not found');
  END IF;

  -- Check permission: author or admin can pin
  IF v_note.created_by != v_user_id THEN
    -- Check if user is admin for this tenant
    IF NOT EXISTS (
      SELECT 1 FROM public.tenant_users tu
      WHERE tu.tenant_id = v_note.tenant_id::bigint
      AND tu.user_id = v_user_id
      AND tu.role IN ('admin', 'superadmin')
    ) THEN
      RETURN jsonb_build_object('success', false, 'error', 'Not authorized to modify this note');
    END IF;
  END IF;

  -- Update the note
  UPDATE public.client_notes
  SET is_pinned = p_is_pinned, updated_at = now()
  WHERE id = p_note_id;

  -- Determine event type
  v_event_type := CASE WHEN p_is_pinned THEN 'note_pinned' ELSE 'note_unpinned' END;
  v_title := CASE WHEN p_is_pinned 
    THEN format('Note pinned: %s', COALESCE(v_note.title, LEFT(v_note.content, 30)))
    ELSE format('Note unpinned: %s', COALESCE(v_note.title, LEFT(v_note.content, 30)))
  END;

  -- Insert timeline event
  INSERT INTO public.client_timeline_events (
    tenant_id, client_id, created_by, source, event_type, title, body,
    entity_type, entity_id, metadata, occurred_at
  ) VALUES (
    v_note.tenant_id::integer,
    v_note.client_id,
    v_user_id,
    'user',
    v_event_type,
    v_title,
    NULL,
    'note',
    p_note_id::text,
    jsonb_build_object('note_id', p_note_id, 'is_pinned', p_is_pinned),
    now()
  );

  RETURN jsonb_build_object('success', true);
END;
$$;

-- Add index for pinned notes lookup
CREATE INDEX IF NOT EXISTS idx_client_notes_pinned 
ON public.client_notes (tenant_id, client_id, is_pinned, updated_at DESC)
WHERE is_pinned = true;

-- Grant execute permission
GRANT EXECUTE ON FUNCTION public.rpc_toggle_client_note_pin TO authenticated;