
-- Recreate meetings_shared view to include MS artifact sync columns
CREATE OR REPLACE VIEW public.meetings_shared AS
SELECT m.id,
    m.tenant_id,
    m.owner_user_uuid,
    m.starts_at,
    m.ends_at,
    m.timezone,
    m.is_online,
    m.status,
    m.external_meeting_url,
    m.provider,
    m.is_organizer,
    m.time_draft_created,
    m.created_at,
    m.updated_at,
    CASE
        WHEN m.owner_user_uuid = auth.uid() THEN m.title
        WHEN cs.scope = 'details'::text THEN m.title
        ELSE 'Busy'::text
    END AS title,
    CASE
        WHEN m.owner_user_uuid = auth.uid() THEN m.location
        WHEN cs.scope = 'details'::text THEN m.location
        ELSE NULL::text
    END AS location,
    CASE
        WHEN m.owner_user_uuid = auth.uid() THEN m.client_id
        WHEN cs.scope = 'details'::text THEN m.client_id
        ELSE NULL::bigint
    END AS client_id,
    CASE
        WHEN m.owner_user_uuid = auth.uid() THEN m.package_id
        WHEN cs.scope = 'details'::text THEN m.package_id
        ELSE NULL::bigint
    END AS package_id,
    CASE
        WHEN m.owner_user_uuid = auth.uid() THEN m.needs_linking
        ELSE false
    END AS needs_linking,
    CASE
        WHEN m.owner_user_uuid = auth.uid() THEN 'owner'::text
        WHEN cs.scope IS NOT NULL THEN cs.scope
        ELSE 'none'::text
    END AS access_scope,
    -- MS artifact sync fields (owner-only)
    CASE
        WHEN m.owner_user_uuid = auth.uid() THEN m.ms_ical_uid
        ELSE NULL::text
    END AS ms_ical_uid,
    CASE
        WHEN m.owner_user_uuid = auth.uid() THEN m.ms_join_url
        ELSE NULL::text
    END AS ms_join_url,
    CASE
        WHEN m.owner_user_uuid = auth.uid() THEN m.ms_organizer_email
        ELSE NULL::text
    END AS ms_organizer_email,
    CASE
        WHEN m.owner_user_uuid = auth.uid() THEN m.ms_last_synced_at
        ELSE NULL::timestamptz
    END AS ms_last_synced_at,
    CASE
        WHEN m.owner_user_uuid = auth.uid() THEN m.ms_sync_status
        ELSE NULL::text
    END AS ms_sync_status,
    CASE
        WHEN m.owner_user_uuid = auth.uid() THEN m.ms_sync_error
        ELSE NULL::text
    END AS ms_sync_error
FROM meetings m
LEFT JOIN calendar_shares cs ON cs.owner_user_uuid = m.owner_user_uuid AND cs.viewer_user_uuid = auth.uid()
WHERE m.owner_user_uuid = auth.uid() OR cs.viewer_user_uuid IS NOT NULL;
