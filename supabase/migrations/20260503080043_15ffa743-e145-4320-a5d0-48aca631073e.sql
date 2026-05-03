CREATE OR REPLACE VIEW public.v_client_tenant_users
WITH (security_invoker = true) AS
WITH active_users AS (
  SELECT
    'active'::text                                                       AS row_type,
    u.user_uuid::text                                                    AS row_key,
    tu.tenant_id::bigint                                                 AS tenant_id,
    u.user_uuid                                                          AS user_id,
    NULLIF(TRIM(u.first_name), '')                                       AS first_name,
    NULLIF(TRIM(u.last_name), '')                                        AS last_name,
    COALESCE(
      NULLIF(TRIM(u.full_name), ''),
      NULLIF(TRIM(COALESCE(u.first_name, '') || ' ' || COALESCE(u.last_name, '')), ''),
      NULLIF(TRIM(u.email), ''),
      'Unnamed user'
    )                                                                    AS display_name,
    NULLIF(TRIM(u.email), '')                                            AS email,
    u.avatar_path                                                        AS avatar_url,
    tu.relationship_role::text                                           AS relationship_role,
    COALESCE(tu.primary_contact, false)                                  AS primary_contact,
    COALESCE(tu.secondary_contact, false)                                AS secondary_contact,
    tu.access_scope,
    u.last_sign_in_at,
    NULL::timestamptz                                                    AS invited_at,
    NULL::timestamptz                                                    AS invite_expires_at,
    CASE
      WHEN COALESCE(u.disabled, false) THEN 'disabled'
      WHEN COALESCE(u.archived, false) THEN 'archived'
      ELSE 'active'
    END                                                                  AS status,
    tu.created_at                                                        AS member_since,
    NULL::timestamptz                                                    AS last_sent_at,
    NULL::text                                                           AS mailgun_message_id
  FROM tenant_users tu
  JOIN users u ON u.user_uuid = tu.user_id
  WHERE NOT COALESCE(u.archived, false)
    AND NOT COALESCE(u.is_vivacity_internal, false)
),
pending_invites AS (
  SELECT
    'invited'::text                                                      AS row_type,
    ui.id::text                                                          AS row_key,
    ui.tenant_id::bigint                                                 AS tenant_id,
    NULL::uuid                                                           AS user_id,
    NULLIF(TRIM(ui.first_name), '')                                      AS first_name,
    NULLIF(TRIM(ui.last_name), '')                                       AS last_name,
    COALESCE(
      NULLIF(TRIM(COALESCE(ui.first_name, '') || ' ' || COALESCE(ui.last_name, '')), ''),
      NULLIF(TRIM(ui.email), ''),
      'Pending invite'
    )                                                                    AS display_name,
    NULLIF(TRIM(ui.email), '')                                           AS email,
    NULL::text                                                           AS avatar_url,
    ui.relationship_role::text                                           AS relationship_role,
    NULL::boolean                                                        AS primary_contact,
    NULL::boolean                                                        AS secondary_contact,
    NULL::text                                                           AS access_scope,
    NULL::timestamptz                                                    AS last_sign_in_at,
    ui.created_at                                                        AS invited_at,
    ui.expires_at                                                        AS invite_expires_at,
    'invited'::text                                                      AS status,
    ui.created_at                                                        AS member_since,
    ui.last_sent_at                                                      AS last_sent_at,
    ui.mailgun_message_id                                                AS mailgun_message_id
  FROM user_invitations ui
  WHERE COALESCE(ui.status, 'pending') = 'pending'
    AND ui.accepted_at IS NULL
    AND ui.revoked_at IS NULL
    AND ui.expires_at > now()
)
SELECT * FROM active_users
UNION ALL
SELECT * FROM pending_invites;

GRANT SELECT ON public.v_client_tenant_users TO authenticated;

COMMENT ON VIEW public.v_client_tenant_users IS
  'Per-tenant list of confirmed users + pending invitations for the client-portal Users page. '
  'UNION ALL of tenant_users JOIN users (active, excluding archived and Vivacity-internal) and user_invitations (pending, non-expired, non-revoked). '
  'row_type identifies the source. status one of: active, disabled, archived, invited. last_sent_at + mailgun_message_id only populated for invited rows. security_invoker=true.';