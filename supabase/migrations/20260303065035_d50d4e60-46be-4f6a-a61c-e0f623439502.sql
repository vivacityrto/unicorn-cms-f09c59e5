
-- =========================================================
-- Broadcast Campaigns System
-- =========================================================

-- 1. broadcast_campaigns table
CREATE TABLE public.broadcast_campaigns (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  body text NOT NULL,
  target_mode text NOT NULL,
  package_type text NULL,
  include_roles text[] NOT NULL DEFAULT ARRAY['parent'],
  status text NOT NULL DEFAULT 'draft',
  scheduled_for timestamptz NULL,
  created_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  sent_at timestamptz NULL,
  total_recipients integer NOT NULL DEFAULT 0,
  total_sent integer NOT NULL DEFAULT 0,
  total_failed integer NOT NULL DEFAULT 0,
  CONSTRAINT broadcast_campaigns_created_by_fk FOREIGN KEY (created_by) REFERENCES public.users(user_uuid) ON DELETE RESTRICT,
  CONSTRAINT broadcast_campaigns_target_mode_check CHECK (target_mode IN ('everyone','members','package_type')),
  CONSTRAINT broadcast_campaigns_status_check CHECK (status IN ('draft','queued','sending','sent','cancelled'))
);

ALTER TABLE public.broadcast_campaigns ENABLE ROW LEVEL SECURITY;

CREATE POLICY "bc_select_staff" ON public.broadcast_campaigns FOR SELECT TO authenticated
  USING (public.is_vivacity_team_safe(auth.uid()));

CREATE POLICY "bc_insert_staff" ON public.broadcast_campaigns FOR INSERT TO authenticated
  WITH CHECK (public.is_vivacity_team_safe(auth.uid()));

CREATE POLICY "bc_update_staff" ON public.broadcast_campaigns FOR UPDATE TO authenticated
  USING (public.is_vivacity_team_safe(auth.uid()));

-- 2. broadcast_recipients table
CREATE TABLE public.broadcast_recipients (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id uuid NOT NULL REFERENCES public.broadcast_campaigns(id) ON DELETE CASCADE,
  tenant_id bigint NOT NULL,
  user_id uuid NOT NULL,
  conversation_id uuid NULL,
  delivery_status text NOT NULL DEFAULT 'queued',
  sent_at timestamptz NULL,
  failure_reason text NULL,
  CONSTRAINT broadcast_recipients_status_check CHECK (delivery_status IN ('queued','sent','failed','skipped'))
);

CREATE INDEX idx_broadcast_recipients_campaign_id ON public.broadcast_recipients(campaign_id);

ALTER TABLE public.broadcast_recipients ENABLE ROW LEVEL SECURITY;

CREATE POLICY "br_select_staff" ON public.broadcast_recipients FOR SELECT TO authenticated
  USING (public.is_vivacity_team_safe(auth.uid()));

CREATE POLICY "br_insert_staff" ON public.broadcast_recipients FOR INSERT TO authenticated
  WITH CHECK (public.is_vivacity_team_safe(auth.uid()));

CREATE POLICY "br_update_staff" ON public.broadcast_recipients FOR UPDATE TO authenticated
  USING (public.is_vivacity_team_safe(auth.uid()));

-- 3. Preview function
CREATE OR REPLACE FUNCTION public.fn_preview_broadcast_recipients(
  p_target_mode text,
  p_package_type text DEFAULT NULL,
  p_include_roles text[] DEFAULT ARRAY['parent']
)
RETURNS TABLE(tenant_id bigint, user_id uuid, tenant_name text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT DISTINCT ON (tu.user_id)
    t.id AS tenant_id,
    tu.user_id,
    t.name AS tenant_name
  FROM tenants t
  JOIN tenant_users tu ON tu.tenant_id = t.id
  WHERE
    -- Exclude system tenant
    t.id != 6372
    -- Active tenants only
    AND t.status = 'active'
    -- Role filter
    AND tu.role = ANY(p_include_roles)
    -- Target mode filtering
    AND (
      CASE p_target_mode
        WHEN 'everyone' THEN true
        WHEN 'members' THEN EXISTS (
          SELECT 1 FROM package_instances pi
          JOIN packages p ON p.id = pi.package_id
          WHERE pi.tenant_id = t.id
            AND pi.is_complete = false
            AND p.package_type = 'membership'
        )
        WHEN 'package_type' THEN EXISTS (
          SELECT 1 FROM package_instances pi
          JOIN packages p ON p.id = pi.package_id
          WHERE pi.tenant_id = t.id
            AND pi.is_complete = false
            AND p.package_type = p_target_mode
        )
        ELSE false
      END
    )
  ORDER BY tu.user_id, t.id;
END;
$$;

-- 4. Queue function
CREATE OR REPLACE FUNCTION public.fn_queue_broadcast_campaign(p_campaign_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_status text;
  v_target_mode text;
  v_package_type text;
  v_include_roles text[];
  v_count integer;
BEGIN
  -- Get and validate campaign
  SELECT status, target_mode, package_type, include_roles
  INTO v_status, v_target_mode, v_package_type, v_include_roles
  FROM broadcast_campaigns
  WHERE id = p_campaign_id;

  IF v_status IS NULL THEN
    RAISE EXCEPTION 'Campaign not found';
  END IF;

  IF v_status != 'draft' THEN
    RAISE EXCEPTION 'Campaign must be in draft status to queue (current: %)', v_status;
  END IF;

  -- Insert recipients from preview
  INSERT INTO broadcast_recipients (campaign_id, tenant_id, user_id)
  SELECT p_campaign_id, r.tenant_id, r.user_id
  FROM fn_preview_broadcast_recipients(v_target_mode, v_package_type, v_include_roles) r;

  GET DIAGNOSTICS v_count = ROW_COUNT;

  IF v_count = 0 THEN
    RAISE EXCEPTION 'No recipients matched the targeting criteria';
  END IF;

  -- Update campaign
  UPDATE broadcast_campaigns
  SET status = 'queued',
      total_recipients = v_count
  WHERE id = p_campaign_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.fn_preview_broadcast_recipients TO authenticated;
GRANT EXECUTE ON FUNCTION public.fn_queue_broadcast_campaign TO authenticated;
