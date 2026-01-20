
-- Add minutes versioning columns to eos_meetings
ALTER TABLE public.eos_meetings 
ADD COLUMN IF NOT EXISTS current_minutes_version_id UUID,
ADD COLUMN IF NOT EXISTS minutes_status TEXT NOT NULL DEFAULT 'Draft' CHECK (minutes_status IN ('Draft', 'Final', 'Locked'));

-- Create meeting minutes versions table
CREATE TABLE public.eos_meeting_minutes_versions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  meeting_id UUID NOT NULL REFERENCES public.eos_meetings(id) ON DELETE CASCADE,
  version_number INTEGER NOT NULL DEFAULT 1,
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  change_summary TEXT,
  minutes_snapshot JSONB NOT NULL DEFAULT '{}'::JSONB,
  is_final BOOLEAN NOT NULL DEFAULT false,
  is_locked BOOLEAN NOT NULL DEFAULT false,
  
  CONSTRAINT unique_meeting_version UNIQUE(meeting_id, version_number)
);

-- Create index for faster lookups
CREATE INDEX idx_minutes_versions_meeting_id ON public.eos_meeting_minutes_versions(meeting_id);
CREATE INDEX idx_minutes_versions_created_at ON public.eos_meeting_minutes_versions(created_at DESC);

-- Add foreign key for current_minutes_version_id
ALTER TABLE public.eos_meetings 
ADD CONSTRAINT fk_current_minutes_version 
FOREIGN KEY (current_minutes_version_id) 
REFERENCES public.eos_meeting_minutes_versions(id);

-- Create minutes audit log table
CREATE TABLE public.eos_minutes_audit_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  action TEXT NOT NULL CHECK (action IN (
    'minutes_version_created',
    'minutes_finalised',
    'minutes_revision_created', 
    'minutes_locked',
    'minutes_unlocked',
    'minutes_version_restored'
  )),
  user_id UUID REFERENCES auth.users(id),
  meeting_id UUID NOT NULL REFERENCES public.eos_meetings(id) ON DELETE CASCADE,
  minutes_version_id UUID REFERENCES public.eos_meeting_minutes_versions(id),
  tenant_id BIGINT NOT NULL,
  change_summary TEXT,
  details JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_minutes_audit_meeting ON public.eos_minutes_audit_log(meeting_id);
CREATE INDEX idx_minutes_audit_tenant ON public.eos_minutes_audit_log(tenant_id);

-- Enable RLS
ALTER TABLE public.eos_meeting_minutes_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.eos_minutes_audit_log ENABLE ROW LEVEL SECURITY;

-- RLS policies for minutes versions
CREATE POLICY "Users can view minutes versions for their tenant meetings"
ON public.eos_meeting_minutes_versions FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.eos_meetings m
    JOIN public.tenant_users tu ON tu.tenant_id = m.tenant_id
    WHERE m.id = eos_meeting_minutes_versions.meeting_id
    AND tu.user_id = auth.uid()
  )
);

CREATE POLICY "Users can insert minutes versions for their tenant meetings"
ON public.eos_meeting_minutes_versions FOR INSERT
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.eos_meetings m
    JOIN public.tenant_users tu ON tu.tenant_id = m.tenant_id
    WHERE m.id = meeting_id
    AND tu.user_id = auth.uid()
    AND tu.role IN ('SuperAdmin', 'Admin')
  )
);

CREATE POLICY "Users can update minutes versions for their tenant meetings"
ON public.eos_meeting_minutes_versions FOR UPDATE
USING (
  EXISTS (
    SELECT 1 FROM public.eos_meetings m
    JOIN public.tenant_users tu ON tu.tenant_id = m.tenant_id
    WHERE m.id = eos_meeting_minutes_versions.meeting_id
    AND tu.user_id = auth.uid()
    AND tu.role IN ('SuperAdmin', 'Admin')
  )
);

-- RLS policies for minutes audit log
CREATE POLICY "Users can view minutes audit logs for their tenant"
ON public.eos_minutes_audit_log FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.tenant_users tu
    WHERE tu.tenant_id = eos_minutes_audit_log.tenant_id
    AND tu.user_id = auth.uid()
  )
);

CREATE POLICY "System can insert minutes audit logs"
ON public.eos_minutes_audit_log FOR INSERT
WITH CHECK (true);

-- RPC: Save minutes version
CREATE OR REPLACE FUNCTION public.save_meeting_minutes(
  p_meeting_id UUID,
  p_minutes_snapshot JSONB,
  p_change_summary TEXT DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_version_id UUID;
  v_version_number INTEGER;
  v_meeting RECORD;
  v_current_snapshot JSONB;
  v_tenant_id BIGINT;
BEGIN
  -- Get meeting info
  SELECT m.*, tu.tenant_id INTO v_meeting
  FROM eos_meetings m
  JOIN tenant_users tu ON tu.tenant_id = m.tenant_id AND tu.user_id = auth.uid()
  WHERE m.id = p_meeting_id;
  
  IF v_meeting IS NULL THEN
    RAISE EXCEPTION 'Meeting not found or access denied';
  END IF;
  
  IF v_meeting.minutes_status = 'Locked' THEN
    RAISE EXCEPTION 'Cannot edit locked minutes';
  END IF;
  
  v_tenant_id := v_meeting.tenant_id;
  
  -- Get current snapshot to compare
  IF v_meeting.current_minutes_version_id IS NOT NULL THEN
    SELECT minutes_snapshot INTO v_current_snapshot
    FROM eos_meeting_minutes_versions
    WHERE id = v_meeting.current_minutes_version_id;
    
    -- Skip if no material change
    IF v_current_snapshot = p_minutes_snapshot THEN
      RETURN v_meeting.current_minutes_version_id;
    END IF;
  END IF;
  
  -- Get next version number
  SELECT COALESCE(MAX(version_number), 0) + 1 INTO v_version_number
  FROM eos_meeting_minutes_versions
  WHERE meeting_id = p_meeting_id;
  
  -- Create new version
  INSERT INTO eos_meeting_minutes_versions (
    meeting_id, version_number, created_by, change_summary, minutes_snapshot
  ) VALUES (
    p_meeting_id, v_version_number, auth.uid(), 
    COALESCE(p_change_summary, CASE WHEN v_version_number = 1 THEN 'Initial minutes' ELSE 'Updated minutes' END),
    p_minutes_snapshot
  ) RETURNING id INTO v_version_id;
  
  -- Update meeting with current version
  UPDATE eos_meetings 
  SET current_minutes_version_id = v_version_id,
      updated_at = now()
  WHERE id = p_meeting_id;
  
  -- Log the action
  INSERT INTO eos_minutes_audit_log (action, user_id, meeting_id, minutes_version_id, tenant_id, change_summary)
  VALUES ('minutes_version_created', auth.uid(), p_meeting_id, v_version_id, v_tenant_id, p_change_summary);
  
  RETURN v_version_id;
END;
$$;

-- RPC: Finalise minutes
CREATE OR REPLACE FUNCTION public.finalise_meeting_minutes(
  p_meeting_id UUID,
  p_summary TEXT
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_meeting RECORD;
  v_version_id UUID;
  v_tenant_id BIGINT;
BEGIN
  -- Get meeting info
  SELECT m.*, tu.tenant_id INTO v_meeting
  FROM eos_meetings m
  JOIN tenant_users tu ON tu.tenant_id = m.tenant_id AND tu.user_id = auth.uid()
  WHERE m.id = p_meeting_id
  AND tu.role IN ('SuperAdmin', 'Admin');
  
  IF v_meeting IS NULL THEN
    RAISE EXCEPTION 'Meeting not found or access denied';
  END IF;
  
  IF v_meeting.minutes_status = 'Locked' THEN
    RAISE EXCEPTION 'Cannot finalise locked minutes';
  END IF;
  
  v_tenant_id := v_meeting.tenant_id;
  v_version_id := v_meeting.current_minutes_version_id;
  
  -- Mark current version as final
  UPDATE eos_meeting_minutes_versions 
  SET is_final = true
  WHERE id = v_version_id;
  
  -- Update meeting status
  UPDATE eos_meetings 
  SET minutes_status = 'Final',
      updated_at = now()
  WHERE id = p_meeting_id;
  
  -- Log the action
  INSERT INTO eos_minutes_audit_log (action, user_id, meeting_id, minutes_version_id, tenant_id, change_summary)
  VALUES ('minutes_finalised', auth.uid(), p_meeting_id, v_version_id, v_tenant_id, p_summary);
  
  RETURN v_version_id;
END;
$$;

-- RPC: Create revision (for editing after finalisation)
CREATE OR REPLACE FUNCTION public.create_minutes_revision(
  p_meeting_id UUID,
  p_reason TEXT
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_meeting RECORD;
  v_current_snapshot JSONB;
  v_version_id UUID;
  v_version_number INTEGER;
  v_tenant_id BIGINT;
BEGIN
  -- Get meeting info
  SELECT m.*, tu.tenant_id INTO v_meeting
  FROM eos_meetings m
  JOIN tenant_users tu ON tu.tenant_id = m.tenant_id AND tu.user_id = auth.uid()
  WHERE m.id = p_meeting_id
  AND tu.role IN ('SuperAdmin', 'Admin');
  
  IF v_meeting IS NULL THEN
    RAISE EXCEPTION 'Meeting not found or access denied';
  END IF;
  
  IF v_meeting.minutes_status = 'Locked' THEN
    RAISE EXCEPTION 'Cannot revise locked minutes';
  END IF;
  
  v_tenant_id := v_meeting.tenant_id;
  
  -- Get current snapshot
  SELECT minutes_snapshot INTO v_current_snapshot
  FROM eos_meeting_minutes_versions
  WHERE id = v_meeting.current_minutes_version_id;
  
  -- Get next version number
  SELECT COALESCE(MAX(version_number), 0) + 1 INTO v_version_number
  FROM eos_meeting_minutes_versions
  WHERE meeting_id = p_meeting_id;
  
  -- Create new revision version
  INSERT INTO eos_meeting_minutes_versions (
    meeting_id, version_number, created_by, change_summary, minutes_snapshot
  ) VALUES (
    p_meeting_id, v_version_number, auth.uid(), 
    'Revision: ' || p_reason,
    v_current_snapshot
  ) RETURNING id INTO v_version_id;
  
  -- Update meeting
  UPDATE eos_meetings 
  SET current_minutes_version_id = v_version_id,
      minutes_status = 'Draft',
      updated_at = now()
  WHERE id = p_meeting_id;
  
  -- Log the action
  INSERT INTO eos_minutes_audit_log (action, user_id, meeting_id, minutes_version_id, tenant_id, change_summary)
  VALUES ('minutes_revision_created', auth.uid(), p_meeting_id, v_version_id, v_tenant_id, p_reason);
  
  RETURN v_version_id;
END;
$$;

-- RPC: Lock minutes (SuperAdmin only)
CREATE OR REPLACE FUNCTION public.lock_meeting_minutes(
  p_meeting_id UUID,
  p_reason TEXT DEFAULT 'Minutes locked'
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_meeting RECORD;
  v_tenant_id BIGINT;
BEGIN
  -- Get meeting info - SuperAdmin only
  SELECT m.*, tu.tenant_id INTO v_meeting
  FROM eos_meetings m
  JOIN tenant_users tu ON tu.tenant_id = m.tenant_id AND tu.user_id = auth.uid()
  WHERE m.id = p_meeting_id
  AND tu.role = 'SuperAdmin';
  
  IF v_meeting IS NULL THEN
    RAISE EXCEPTION 'Meeting not found or SuperAdmin access required';
  END IF;
  
  v_tenant_id := v_meeting.tenant_id;
  
  -- Mark current version as locked
  UPDATE eos_meeting_minutes_versions 
  SET is_locked = true
  WHERE id = v_meeting.current_minutes_version_id;
  
  -- Update meeting status
  UPDATE eos_meetings 
  SET minutes_status = 'Locked',
      updated_at = now()
  WHERE id = p_meeting_id;
  
  -- Log the action
  INSERT INTO eos_minutes_audit_log (action, user_id, meeting_id, minutes_version_id, tenant_id, change_summary)
  VALUES ('minutes_locked', auth.uid(), p_meeting_id, v_meeting.current_minutes_version_id, v_tenant_id, p_reason);
END;
$$;

-- RPC: Unlock minutes (SuperAdmin only)
CREATE OR REPLACE FUNCTION public.unlock_meeting_minutes(
  p_meeting_id UUID,
  p_reason TEXT
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_meeting RECORD;
  v_tenant_id BIGINT;
BEGIN
  -- Get meeting info - SuperAdmin only
  SELECT m.*, tu.tenant_id INTO v_meeting
  FROM eos_meetings m
  JOIN tenant_users tu ON tu.tenant_id = m.tenant_id AND tu.user_id = auth.uid()
  WHERE m.id = p_meeting_id
  AND tu.role = 'SuperAdmin';
  
  IF v_meeting IS NULL THEN
    RAISE EXCEPTION 'Meeting not found or SuperAdmin access required';
  END IF;
  
  v_tenant_id := v_meeting.tenant_id;
  
  -- Unlock current version
  UPDATE eos_meeting_minutes_versions 
  SET is_locked = false
  WHERE id = v_meeting.current_minutes_version_id;
  
  -- Update meeting status back to Final
  UPDATE eos_meetings 
  SET minutes_status = 'Final',
      updated_at = now()
  WHERE id = p_meeting_id;
  
  -- Log the action
  INSERT INTO eos_minutes_audit_log (action, user_id, meeting_id, minutes_version_id, tenant_id, change_summary)
  VALUES ('minutes_unlocked', auth.uid(), p_meeting_id, v_meeting.current_minutes_version_id, v_tenant_id, p_reason);
END;
$$;

-- RPC: Restore minutes version
CREATE OR REPLACE FUNCTION public.restore_minutes_version(
  p_version_id UUID,
  p_reason TEXT
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_old_version RECORD;
  v_meeting RECORD;
  v_new_version_id UUID;
  v_version_number INTEGER;
  v_tenant_id BIGINT;
BEGIN
  -- Get old version info
  SELECT * INTO v_old_version
  FROM eos_meeting_minutes_versions
  WHERE id = p_version_id;
  
  IF v_old_version IS NULL THEN
    RAISE EXCEPTION 'Version not found';
  END IF;
  
  -- Get meeting info
  SELECT m.*, tu.tenant_id INTO v_meeting
  FROM eos_meetings m
  JOIN tenant_users tu ON tu.tenant_id = m.tenant_id AND tu.user_id = auth.uid()
  WHERE m.id = v_old_version.meeting_id
  AND tu.role IN ('SuperAdmin', 'Admin');
  
  IF v_meeting IS NULL THEN
    RAISE EXCEPTION 'Meeting not found or access denied';
  END IF;
  
  IF v_meeting.minutes_status = 'Locked' THEN
    RAISE EXCEPTION 'Cannot restore to locked minutes';
  END IF;
  
  v_tenant_id := v_meeting.tenant_id;
  
  -- Get next version number
  SELECT COALESCE(MAX(version_number), 0) + 1 INTO v_version_number
  FROM eos_meeting_minutes_versions
  WHERE meeting_id = v_old_version.meeting_id;
  
  -- Create new version with restored content
  INSERT INTO eos_meeting_minutes_versions (
    meeting_id, version_number, created_by, change_summary, minutes_snapshot
  ) VALUES (
    v_old_version.meeting_id, v_version_number, auth.uid(), 
    'Restored from version ' || v_old_version.version_number || ': ' || p_reason,
    v_old_version.minutes_snapshot
  ) RETURNING id INTO v_new_version_id;
  
  -- Update meeting
  UPDATE eos_meetings 
  SET current_minutes_version_id = v_new_version_id,
      minutes_status = 'Draft',
      updated_at = now()
  WHERE id = v_old_version.meeting_id;
  
  -- Log the action
  INSERT INTO eos_minutes_audit_log (action, user_id, meeting_id, minutes_version_id, tenant_id, change_summary, details)
  VALUES (
    'minutes_version_restored', auth.uid(), v_old_version.meeting_id, v_new_version_id, v_tenant_id, p_reason,
    jsonb_build_object('restored_from_version', v_old_version.version_number)
  );
  
  RETURN v_new_version_id;
END;
$$;
