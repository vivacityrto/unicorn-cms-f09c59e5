CREATE OR REPLACE VIEW public.v_client_tenant_users AS
WITH active_users AS (
  SELECT 'active'::text AS row_type,
    u.user_uuid::text AS row_key,
    tu.tenant_id,
    u.user_uuid AS user_id,
    NULLIF(TRIM(BOTH FROM u.first_name), ''::text) AS first_name,
    NULLIF(TRIM(BOTH FROM u.last_name), ''::text) AS last_name,
    COALESCE(NULLIF(TRIM(BOTH FROM (COALESCE(u.first_name, ''::text) || ' '::text) || COALESCE(u.last_name, ''::text)), ''::text), NULLIF(TRIM(BOTH FROM u.email), ''::text), 'Unnamed user'::text) AS display_name,
    NULLIF(TRIM(BOTH FROM u.email), ''::text) AS email,
    u.avatar_path AS avatar_url,
    tu.relationship_role,
    COALESCE(tu.primary_contact, false) AS primary_contact,
    COALESCE(tu.secondary_contact, false) AS secondary_contact,
    tu.access_scope,
    u.last_sign_in_at,
    NULL::timestamptz AS invited_at,
    NULL::timestamptz AS invite_expires_at,
    CASE
      WHEN COALESCE(u.disabled, false) THEN 'disabled'::text
      WHEN COALESCE(u.archived, false) THEN 'archived'::text
      ELSE 'active'::text
    END AS status,
    tu.created_at AS member_since,
    NULL::timestamptz AS last_sent_at,
    NULL::text AS mailgun_message_id,
    NULL::text AS delivery_status,
    NULL::timestamptz AS delivery_event_at,
    NULL::integer AS open_count,
    NULL::timestamptz AS first_opened_at,
    NULL::integer AS click_count,
    NULL::timestamptz AS first_clicked_at,
    GREATEST(u.last_sign_in_at, sess.last_session_at) AS last_active_at
  FROM tenant_users tu
    JOIN users u ON u.user_uuid = tu.user_id
    LEFT JOIN LATERAL (
      SELECT max(s.updated_at) AS last_session_at
      FROM auth.sessions s
      WHERE s.user_id = u.user_uuid
    ) sess ON true
  WHERE NOT COALESCE(u.archived, false) AND NOT COALESCE(u.is_vivacity_internal, false)
), pending_invites AS (
  SELECT 'invited'::text AS row_type,
    ui.id::text AS row_key,
    ui.tenant_id,
    NULL::uuid AS user_id,
    NULLIF(TRIM(BOTH FROM ui.first_name), ''::text) AS first_name,
    NULLIF(TRIM(BOTH FROM ui.last_name), ''::text) AS last_name,
    COALESCE(NULLIF(TRIM(BOTH FROM (COALESCE(ui.first_name, ''::text) || ' '::text) || COALESCE(ui.last_name, ''::text)), ''::text), NULLIF(TRIM(BOTH FROM ui.email), ''::text), 'Pending invite'::text) AS display_name,
    NULLIF(TRIM(BOTH FROM ui.email), ''::text) AS email,
    NULL::text AS avatar_url,
    ui.relationship_role,
    NULL::boolean AS primary_contact,
    NULL::boolean AS secondary_contact,
    NULL::text AS access_scope,
    NULL::timestamptz AS last_sign_in_at,
    ui.created_at AS invited_at,
    ui.expires_at AS invite_expires_at,
    'invited'::text AS status,
    ui.created_at AS member_since,
    ui.last_sent_at,
    ui.mailgun_message_id,
    ui.delivery_status,
    ui.delivery_event_at,
    ui.open_count,
    ui.first_opened_at,
    ui.click_count,
    ui.first_clicked_at,
    NULL::timestamptz AS last_active_at
  FROM user_invitations ui
  WHERE COALESCE(ui.status, 'pending'::text) = 'pending'::text AND ui.accepted_at IS NULL AND ui.revoked_at IS NULL AND ui.expires_at > now()
)
SELECT * FROM active_users
UNION ALL
SELECT * FROM pending_invites;

NOTIFY pgrst, 'reload schema';