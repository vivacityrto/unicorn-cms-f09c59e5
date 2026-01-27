-- Fix 1: Add FK from eos_meeting_participants.user_id to public.users.user_uuid
-- (The column user_id already exists, we just need the FK constraint)
ALTER TABLE public.eos_meeting_participants
DROP CONSTRAINT IF EXISTS eos_meeting_participants_user_id_users_fkey;

ALTER TABLE public.eos_meeting_participants
ADD CONSTRAINT eos_meeting_participants_user_id_users_fkey
FOREIGN KEY (user_id) REFERENCES public.users(user_uuid)
ON DELETE CASCADE;

-- Fix 2: Add indexes for performance
CREATE INDEX IF NOT EXISTS idx_emp_meeting_id
ON public.eos_meeting_participants(meeting_id);

CREATE INDEX IF NOT EXISTS idx_emp_user_id
ON public.eos_meeting_participants(user_id);

-- Fix 3: Update create_issue RPC to use linked_rock_id instead of rock_id
CREATE OR REPLACE FUNCTION public.create_issue(
  p_tenant_id BIGINT,
  p_source TEXT DEFAULT 'ad_hoc',
  p_title TEXT DEFAULT '',
  p_description TEXT DEFAULT NULL,
  p_priority TEXT DEFAULT 'medium',
  p_client_id UUID DEFAULT NULL,
  p_linked_rock_id UUID DEFAULT NULL,
  p_meeting_id UUID DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_issue_id UUID;
  v_priority_int INTEGER;
BEGIN
  -- Convert text priority to integer
  v_priority_int := CASE LOWER(p_priority)
    WHEN 'high' THEN 3
    WHEN 'medium' THEN 2
    WHEN 'low' THEN 1
    ELSE 2
  END;

  INSERT INTO eos_issues (
    tenant_id, client_id, title, description, priority, status,
    raised_by, linked_rock_id, meeting_id, created_by
  ) VALUES (
    p_tenant_id, p_client_id, p_title, p_description, v_priority_int, 'open',
    auth.uid(), p_linked_rock_id, p_meeting_id, auth.uid()
  )
  RETURNING id INTO v_issue_id;

  -- Audit log
  INSERT INTO audit_eos_events (
    tenant_id, user_id, meeting_id, entity, entity_id, action, reason, details
  ) VALUES (
    p_tenant_id, auth.uid(), p_meeting_id, 'issue', v_issue_id, 'created',
    'Issue created from ' || p_source,
    jsonb_build_object('source', p_source, 'priority', p_priority)
  );

  RETURN v_issue_id;
END;
$$;

-- Fix 4: Reload PostgREST schema cache
NOTIFY pgrst, 'reload schema';