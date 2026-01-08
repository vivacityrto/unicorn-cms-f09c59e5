-- Phase 3 Slice 2: Bulk actions, rollups, quick matching, hardening

-- ============================================
-- A) Add suggestion columns to calendar_time_drafts
-- ============================================
ALTER TABLE public.calendar_time_drafts
ADD COLUMN IF NOT EXISTS suggested_client_id bigint NULL REFERENCES public.tenants(id),
ADD COLUMN IF NOT EXISTS suggested_package_id bigint NULL REFERENCES public.packages(id),
ADD COLUMN IF NOT EXISTS match_confidence numeric(5,2) DEFAULT 0,
ADD COLUMN IF NOT EXISTS match_reason text NULL;

-- ============================================
-- B) Add indexes for performance
-- ============================================
CREATE INDEX IF NOT EXISTS idx_time_entries_tenant_user_status_start 
ON public.time_entries(tenant_id, user_id, source, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_time_entries_tenant_client_start 
ON public.time_entries(tenant_id, client_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_time_entries_tenant_package_start 
ON public.time_entries(tenant_id, package_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_calendar_time_drafts_status_date 
ON public.calendar_time_drafts(tenant_id, created_by, status, work_date DESC);

-- ============================================
-- C) RPC: Bulk update time drafts
-- ============================================
CREATE OR REPLACE FUNCTION public.rpc_bulk_update_time_drafts(
  p_draft_ids uuid[],
  p_fields jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_user_id uuid;
  v_updated_count int := 0;
  v_errors jsonb := '[]'::jsonb;
  v_draft_id uuid;
  v_draft record;
  v_client_id bigint;
  v_package_id bigint;
BEGIN
  -- Get current user
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Not authenticated');
  END IF;

  -- Extract fields
  v_client_id := (p_fields->>'client_id')::bigint;
  v_package_id := (p_fields->>'package_id')::bigint;

  -- Process each draft
  FOREACH v_draft_id IN ARRAY p_draft_ids
  LOOP
    -- Get draft and verify ownership
    SELECT * INTO v_draft
    FROM public.calendar_time_drafts
    WHERE id = v_draft_id
      AND created_by = v_user_id
      AND status = 'draft';

    IF v_draft IS NULL THEN
      v_errors := v_errors || jsonb_build_object(
        'draft_id', v_draft_id,
        'error', 'Draft not found, not yours, or already processed'
      );
      CONTINUE;
    END IF;

    -- If package is set but client not in same tenant, clear package
    IF v_client_id IS NOT NULL AND v_package_id IS NOT NULL THEN
      IF NOT EXISTS (
        SELECT 1 FROM public.client_packages
        WHERE package_id = v_package_id
          AND tenant_id = v_client_id
          AND status = 'active'
      ) THEN
        v_package_id := NULL;
      END IF;
    END IF;

    -- Update the draft
    UPDATE public.calendar_time_drafts
    SET
      client_id = COALESCE(v_client_id, client_id),
      package_id = CASE 
        WHEN v_client_id IS NOT NULL AND v_package_id IS NULL THEN NULL
        ELSE COALESCE(v_package_id, package_id)
      END,
      notes = COALESCE((p_fields->>'notes'), notes),
      is_billable = COALESCE((p_fields->>'is_billable')::boolean, is_billable),
      work_type = COALESCE(p_fields->>'work_type', work_type),
      updated_at = now()
    WHERE id = v_draft_id;

    v_updated_count := v_updated_count + 1;
  END LOOP;

  RETURN jsonb_build_object(
    'success', true,
    'updated_count', v_updated_count,
    'errors', v_errors
  );
END;
$$;

-- ============================================
-- D) RPC: Get client time rollup
-- ============================================
CREATE OR REPLACE FUNCTION public.rpc_get_client_time_rollup(
  p_client_id bigint,
  p_days int DEFAULT 30
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_result jsonb;
  v_cutoff_date timestamptz;
BEGIN
  v_cutoff_date := now() - (p_days || ' days')::interval;

  SELECT jsonb_build_object(
    'total_minutes', COALESCE(SUM(duration_minutes), 0),
    'total_entries', COUNT(*),
    'calendar_minutes', COALESCE(SUM(CASE WHEN source = 'calendar' THEN duration_minutes ELSE 0 END), 0),
    'timer_minutes', COALESCE(SUM(CASE WHEN source = 'timer' THEN duration_minutes ELSE 0 END), 0),
    'manual_minutes', COALESCE(SUM(CASE WHEN source = 'manual' THEN duration_minutes ELSE 0 END), 0),
    'billable_minutes', COALESCE(SUM(CASE WHEN is_billable THEN duration_minutes ELSE 0 END), 0)
  ) INTO v_result
  FROM public.time_entries
  WHERE client_id = p_client_id
    AND created_at >= v_cutoff_date;

  RETURN v_result;
END;
$$;

-- ============================================
-- E) RPC: Get package time rollup
-- ============================================
CREATE OR REPLACE FUNCTION public.rpc_get_package_time_rollup(
  p_client_id bigint,
  p_package_id bigint,
  p_days int DEFAULT 30
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_result jsonb;
  v_cutoff_date timestamptz;
  v_lifetime_minutes bigint;
  v_lifetime_entries bigint;
  v_period_minutes bigint;
  v_period_entries bigint;
BEGIN
  v_cutoff_date := now() - (p_days || ' days')::interval;

  -- Lifetime totals
  SELECT 
    COALESCE(SUM(duration_minutes), 0),
    COUNT(*)
  INTO v_lifetime_minutes, v_lifetime_entries
  FROM public.time_entries
  WHERE client_id = p_client_id
    AND package_id = p_package_id;

  -- Period totals
  SELECT 
    COALESCE(SUM(duration_minutes), 0),
    COUNT(*)
  INTO v_period_minutes, v_period_entries
  FROM public.time_entries
  WHERE client_id = p_client_id
    AND package_id = p_package_id
    AND created_at >= v_cutoff_date;

  RETURN jsonb_build_object(
    'lifetime_minutes', v_lifetime_minutes,
    'lifetime_entries', v_lifetime_entries,
    'period_minutes', v_period_minutes,
    'period_entries', v_period_entries,
    'period_days', p_days
  );
END;
$$;

-- ============================================
-- F) RPC: Apply suggested client/package to draft
-- ============================================
CREATE OR REPLACE FUNCTION public.rpc_apply_draft_suggestion(
  p_draft_id uuid,
  p_apply_client boolean DEFAULT true,
  p_apply_package boolean DEFAULT true
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_user_id uuid;
  v_draft record;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Not authenticated');
  END IF;

  SELECT * INTO v_draft
  FROM public.calendar_time_drafts
  WHERE id = p_draft_id
    AND created_by = v_user_id
    AND status = 'draft';

  IF v_draft IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Draft not found or not yours');
  END IF;

  UPDATE public.calendar_time_drafts
  SET
    client_id = CASE WHEN p_apply_client AND suggested_client_id IS NOT NULL THEN suggested_client_id ELSE client_id END,
    package_id = CASE WHEN p_apply_package AND suggested_package_id IS NOT NULL THEN suggested_package_id ELSE package_id END,
    updated_at = now()
  WHERE id = p_draft_id;

  RETURN jsonb_build_object('success', true);
END;
$$;

-- ============================================
-- G) Function: Match client from event (heuristics)
-- ============================================
CREATE OR REPLACE FUNCTION public.fn_match_client_for_event(
  p_tenant_id bigint,
  p_event_title text,
  p_attendee_emails text[]
)
RETURNS TABLE(client_id bigint, confidence numeric, reason text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_client_id bigint;
  v_confidence numeric;
  v_reason text;
  v_email text;
  v_title_lower text;
BEGIN
  v_title_lower := lower(COALESCE(p_event_title, ''));
  
  -- Strategy 1: Check if attendee email matches a tenant user
  IF p_attendee_emails IS NOT NULL AND array_length(p_attendee_emails, 1) > 0 THEN
    FOREACH v_email IN ARRAY p_attendee_emails
    LOOP
      SELECT tu.tenant_id INTO v_client_id
      FROM public.tenant_users tu
      JOIN public.tenants t ON t.id = tu.tenant_id
      WHERE lower(tu.email) = lower(v_email)
        AND t.parent_tenant_id = p_tenant_id
        AND t.status = 'active'
      LIMIT 1;
      
      IF v_client_id IS NOT NULL THEN
        v_confidence := 0.9;
        v_reason := 'Attendee email matched client user: ' || v_email;
        RETURN QUERY SELECT v_client_id, v_confidence, v_reason;
        RETURN;
      END IF;
    END LOOP;
  END IF;

  -- Strategy 2: Check if title contains client name
  SELECT t.id INTO v_client_id
  FROM public.tenants t
  WHERE t.parent_tenant_id = p_tenant_id
    AND t.status = 'active'
    AND (
      v_title_lower LIKE '%' || lower(t.name) || '%'
      OR v_title_lower LIKE '%' || lower(COALESCE(t.trading_name, '')) || '%'
    )
  ORDER BY length(t.name) DESC
  LIMIT 1;

  IF v_client_id IS NOT NULL THEN
    v_confidence := 0.75;
    v_reason := 'Event title contains client name';
    RETURN QUERY SELECT v_client_id, v_confidence, v_reason;
    RETURN;
  END IF;

  -- No match found
  RETURN;
END;
$$;

-- Grant execute permissions
GRANT EXECUTE ON FUNCTION public.rpc_bulk_update_time_drafts(uuid[], jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_get_client_time_rollup(bigint, int) TO authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_get_package_time_rollup(bigint, bigint, int) TO authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_apply_draft_suggestion(uuid, boolean, boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.fn_match_client_for_event(bigint, text, text[]) TO authenticated;