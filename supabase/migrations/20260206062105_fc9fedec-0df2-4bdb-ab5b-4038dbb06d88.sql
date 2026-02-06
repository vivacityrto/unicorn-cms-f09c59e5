-- 1. Add new columns to calendar_events for client linking and sensitivity
ALTER TABLE calendar_events 
  ADD COLUMN IF NOT EXISTS client_id bigint REFERENCES tenants(id),
  ADD COLUMN IF NOT EXISTS package_id bigint REFERENCES packages(id),
  ADD COLUMN IF NOT EXISTS sensitivity text DEFAULT 'normal';

-- 2. Create calendar_shares table for delegate access
CREATE TABLE calendar_shares (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_user_uuid uuid NOT NULL REFERENCES users(user_uuid) ON DELETE CASCADE,
  viewer_user_uuid uuid NOT NULL REFERENCES users(user_uuid) ON DELETE CASCADE,
  permission text NOT NULL DEFAULT 'view',
  scope text NOT NULL DEFAULT 'busy_only' CHECK (scope IN ('busy_only', 'details')),
  created_by uuid NOT NULL REFERENCES users(user_uuid),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(owner_user_uuid, viewer_user_uuid),
  CHECK (owner_user_uuid != viewer_user_uuid)
);

-- 3. Create audit table for share actions
CREATE TABLE calendar_share_audit (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  action text NOT NULL,
  owner_user_uuid uuid NOT NULL,
  viewer_user_uuid uuid NOT NULL,
  performed_by uuid NOT NULL,
  scope text,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- 4. Enable RLS on calendar_shares
ALTER TABLE calendar_shares ENABLE ROW LEVEL SECURITY;

-- 5. RLS policies for calendar_shares
CREATE POLICY "Users can view shares they own or are viewer of" ON calendar_shares
  FOR SELECT USING (
    owner_user_uuid = auth.uid() OR viewer_user_uuid = auth.uid()
  );

CREATE POLICY "Owners can create shares for their calendar" ON calendar_shares
  FOR INSERT WITH CHECK (owner_user_uuid = auth.uid());

CREATE POLICY "Owners can revoke shares for their calendar" ON calendar_shares
  FOR DELETE USING (owner_user_uuid = auth.uid());

-- 6. Enable RLS on calendar_share_audit
ALTER TABLE calendar_share_audit ENABLE ROW LEVEL SECURITY;

-- 7. RLS for audit - users can see their own audit entries
CREATE POLICY "Users can view audit for shares they own or are viewer of" ON calendar_share_audit
  FOR SELECT USING (
    owner_user_uuid = auth.uid() OR viewer_user_uuid = auth.uid()
  );

CREATE POLICY "System can insert audit entries" ON calendar_share_audit
  FOR INSERT WITH CHECK (performed_by = auth.uid());

-- 8. Create secure view for shared calendar access with redaction
CREATE OR REPLACE VIEW calendar_events_shared WITH (security_invoker = true) AS
SELECT 
  ce.id,
  ce.tenant_id,
  ce.user_id as owner_user_uuid,
  ce.start_at,
  ce.end_at,
  ce.status,
  ce.provider,
  ce.provider_event_id,
  ce.calendar_id,
  ce.meeting_url,
  ce.organizer_email,
  ce.last_synced_at,
  ce.created_at,
  CASE 
    WHEN ce.user_id = auth.uid() THEN ce.title
    WHEN cs.scope = 'details' THEN ce.title
    ELSE 'Busy'
  END as title,
  CASE 
    WHEN ce.user_id = auth.uid() THEN ce.description
    WHEN cs.scope = 'details' THEN ce.description
    ELSE NULL
  END as description,
  CASE 
    WHEN ce.user_id = auth.uid() THEN ce.location
    WHEN cs.scope = 'details' THEN ce.location
    ELSE NULL
  END as location,
  CASE 
    WHEN ce.user_id = auth.uid() THEN ce.attendees
    WHEN cs.scope = 'details' THEN ce.attendees
    ELSE '{"list": [], "emails": []}'::jsonb
  END as attendees,
  ce.client_id,
  ce.package_id,
  ce.sensitivity,
  COALESCE(cs.scope, 'owner') as access_scope
FROM calendar_events ce
LEFT JOIN calendar_shares cs 
  ON cs.owner_user_uuid = ce.user_id 
  AND cs.viewer_user_uuid = auth.uid()
WHERE ce.user_id = auth.uid() 
   OR cs.viewer_user_uuid IS NOT NULL;

-- 9. Add index for performance on calendar_shares lookups
CREATE INDEX idx_calendar_shares_owner ON calendar_shares(owner_user_uuid);
CREATE INDEX idx_calendar_shares_viewer ON calendar_shares(viewer_user_uuid);
CREATE INDEX idx_calendar_events_client ON calendar_events(client_id) WHERE client_id IS NOT NULL;