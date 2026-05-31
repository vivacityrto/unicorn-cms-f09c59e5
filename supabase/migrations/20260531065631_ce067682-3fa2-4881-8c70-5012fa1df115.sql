CREATE OR REPLACE VIEW public.v_auth_user_state AS
SELECT u.user_uuid,
    u.email,
    COALESCE(
      u.tenant_id,
      (
        SELECT tu.tenant_id
        FROM public.tenant_users tu
        WHERE tu.user_id = u.user_uuid
        ORDER BY
          CASE tu.relationship_role
            WHEN 'primary_contact'   THEN 1
            WHEN 'secondary_contact' THEN 2
            WHEN 'user'              THEN 3
            ELSE 4
          END,
          tu.created_at DESC
        LIMIT 1
      )
    ) AS tenant_id,
    u.unicorn_role,
    u.user_type,
    u.disabled,
    au.id IS NULL AS is_ghost,
    au.last_sign_in_at,
    au.created_at AS auth_created_at,
        CASE
            WHEN u.disabled IS TRUE THEN 'disabled'::text
            WHEN au.id IS NULL THEN 'ghost'::text
            WHEN au.last_sign_in_at IS NULL THEN 'invited'::text
            WHEN au.last_sign_in_at >= (now() - '90 days'::interval) THEN 'active'::text
            ELSE 'dormant'::text
        END AS account_state
   FROM public.users u
     LEFT JOIN auth.users au ON au.id = u.user_uuid;