CREATE OR REPLACE VIEW public.v_client_home_hero AS
WITH csc_primary AS (
  SELECT DISTINCT ON (tca.tenant_id) tca.tenant_id,
    tca.csc_user_id,
    tca.role_label,
    u.first_name,
    u.last_name,
    NULLIF(TRIM(BOTH FROM u.email), ''::text) AS email,
    u.avatar_url
  FROM tenant_csc_assignments tca
    LEFT JOIN users u ON u.user_uuid = tca.csc_user_id
  ORDER BY tca.tenant_id, (COALESCE(tca.is_primary, false)) DESC, tca.assigned_since DESC NULLS LAST
), package_aggregates AS (
  SELECT pi.tenant_id,
    min(pi.start_date) AS earliest_package_start,
    count(*) AS total_packages_ever,
    count(*) FILTER (WHERE COALESCE(pi.is_complete, false) = false) AS active_packages,
    count(*) FILTER (WHERE COALESCE(pi.is_complete, false) = true) AS historical_packages
  FROM package_instances pi
  GROUP BY pi.tenant_id
), audit_count AS (
  SELECT ca.subject_tenant_id AS tenant_id,
    count(*) AS audits_total
  FROM client_audits ca
  GROUP BY ca.subject_tenant_id
)
SELECT t.id AS tenant_id,
  t.name AS tenant_name,
  COALESCE(NULLIF(TRIM(BOTH FROM t.legal_name), ''::text), t.name) AS tenant_legal_name,
  (t.created_at AT TIME ZONE 'UTC')::date AS member_since,
  pa.total_packages_ever,
  COALESCE(pa.active_packages, 0::bigint) AS active_packages,
  COALESCE(pa.historical_packages, 0::bigint) AS historical_packages,
  cp.csc_user_id,
  COALESCE(NULLIF(TRIM(BOTH FROM (COALESCE(cp.first_name, ''::text) || ' '::text) || COALESCE(cp.last_name, ''::text)), ''::text), cp.email, NULL::text) AS csc_display_name,
  cp.first_name AS csc_first_name,
  cp.email AS csc_email,
  cp.avatar_url AS csc_avatar_url,
  COALESCE(NULLIF(TRIM(BOTH FROM cp.role_label), ''::text), 'CSC'::text) AS csc_role_label,
  COALESCE(ac.audits_total, 0::bigint) AS audits_total
FROM tenants t
  LEFT JOIN csc_primary cp ON cp.tenant_id = t.id
  LEFT JOIN package_aggregates pa ON pa.tenant_id = t.id
  LEFT JOIN audit_count ac ON ac.tenant_id = t.id;