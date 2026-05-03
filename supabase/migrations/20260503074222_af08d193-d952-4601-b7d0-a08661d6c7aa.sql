CREATE OR REPLACE VIEW public.v_client_home_hero
WITH (security_invoker = true) AS
WITH csc_primary AS (
  SELECT DISTINCT ON (tca.tenant_id)
    tca.tenant_id,
    tca.csc_user_id,
    tca.role_label,
    u.first_name,
    u.last_name,
    NULLIF(TRIM(u.email), '') AS email,
    u.avatar_url
  FROM tenant_csc_assignments tca
  LEFT JOIN users u ON u.user_uuid = tca.csc_user_id
  ORDER BY tca.tenant_id, COALESCE(tca.is_primary, false) DESC, tca.assigned_since DESC NULLS LAST
),
package_aggregates AS (
  SELECT
    pi.tenant_id::bigint                                                 AS tenant_id,
    MIN(pi.start_date)                                                   AS earliest_package_start,
    COUNT(*)                                                             AS total_packages_ever,
    COUNT(*) FILTER (WHERE COALESCE(pi.is_complete, false) = false)      AS active_packages,
    COUNT(*) FILTER (WHERE COALESCE(pi.is_complete, false) = true)       AS historical_packages
  FROM package_instances pi
  GROUP BY pi.tenant_id
),
audit_count AS (
  SELECT
    ca.subject_tenant_id::bigint                                         AS tenant_id,
    COUNT(*)                                                             AS audits_total
  FROM client_audits ca
  GROUP BY ca.subject_tenant_id
)
SELECT
  t.id::bigint                                                           AS tenant_id,
  t.name                                                                 AS tenant_name,
  COALESCE(NULLIF(TRIM(t.legal_name), ''), t.name)                       AS tenant_legal_name,
  pa.earliest_package_start                                              AS member_since,
  pa.total_packages_ever,
  COALESCE(pa.active_packages, 0)                                        AS active_packages,
  COALESCE(pa.historical_packages, 0)                                    AS historical_packages,
  cp.csc_user_id,
  COALESCE(
    NULLIF(TRIM(COALESCE(cp.first_name, '') || ' ' || COALESCE(cp.last_name, '')), ''),
    cp.email,
    NULL
  )                                                                      AS csc_display_name,
  cp.first_name                                                          AS csc_first_name,
  cp.email                                                               AS csc_email,
  cp.avatar_url                                                          AS csc_avatar_url,
  COALESCE(NULLIF(TRIM(cp.role_label), ''), 'CSC')                       AS csc_role_label,
  COALESCE(ac.audits_total, 0)                                           AS audits_total
FROM tenants t
LEFT JOIN csc_primary cp ON cp.tenant_id = t.id
LEFT JOIN package_aggregates pa ON pa.tenant_id = t.id
LEFT JOIN audit_count ac ON ac.tenant_id = t.id;

GRANT SELECT ON public.v_client_home_hero TO authenticated;

COMMENT ON VIEW public.v_client_home_hero IS
  'Single-row-per-tenant data for the client Home page hero strip. Provides tenure anchor '
  '(earliest package_instances.start_date), primary CSC user assignment from tenant_csc_assignments, '
  'package counts, and audit count for empty-state copy. security_invoker=true.';