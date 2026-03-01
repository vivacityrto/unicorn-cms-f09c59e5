
DROP VIEW IF EXISTS public.v_tenant_merge_fields;

CREATE OR REPLACE VIEW public.v_tenant_merge_fields
WITH (security_invoker = true)
AS

SELECT
  t.id AS tenant_id,
  f.id AS field_id,
  f.tag AS field_tag,
  f.name AS field_name,
  f.field_type,
  CASE f.source_column
    WHEN 'logo_path'        THEN t.logo_path
    WHEN 'rto_name'         THEN t.rto_name
    WHEN 'acn'              THEN t.acn
    WHEN 'abn'              THEN t.abn
    WHEN 'website'          THEN t.website
    WHEN 'rto_id'           THEN CAST(t.rto_id AS text)
    WHEN 'lms'              THEN t.lms
    WHEN 'accounting_system' THEN t.accounting_system
    WHEN 'cricos_id'        THEN t.cricos_id
    WHEN 'legal_name'       THEN t.legal_name
    WHEN 'sms'              THEN t.sms
  END AS value,
  'tenants' AS source,
  f.source_table || '.' || f.source_column AS source_reference
FROM public.tenants t
CROSS JOIN public.dd_fields f
WHERE f.source_table = 'tenants'
  AND f.is_active = true

UNION ALL

SELECT
  tp.tenant_id,
  f.id AS field_id,
  f.tag AS field_tag,
  f.name AS field_name,
  f.field_type,
  CASE f.source_column
    WHEN 'phone1'                THEN tp.phone1
    WHEN 'rto_email'             THEN tp.rto_email
    WHEN 'country'               THEN tp.country
    WHEN 'primary_contact_name'  THEN tp.primary_contact_name
    WHEN 'gto_name'              THEN tp.gto_name
  END AS value,
  'tenant_profile' AS source,
  f.source_table || '.' || f.source_column AS source_reference
FROM public.tenant_profile tp
JOIN public.dd_fields f
  ON f.source_table = 'tenant_profile'
 AND f.is_active = true

UNION ALL

SELECT
  ranked.tenant_id,
  f.id AS field_id,
  f.tag AS field_tag,
  f.name AS field_name,
  f.field_type,
  CASE f.source_column
    WHEN 'address1'      THEN ranked.address1 || COALESCE(', ' || ranked.address2, '')
    WHEN 'suburb'        THEN ranked.suburb
    WHEN 'state'         THEN ranked.state
    WHEN 'postcode'      THEN ranked.postcode
    WHEN 'full_address'  THEN CONCAT_WS(', ',
                                NULLIF(ranked.address1, ''),
                                NULLIF(ranked.address2, ''),
                                NULLIF(ranked.suburb, ''),
                                NULLIF(ranked.state, ''),
                                NULLIF(ranked.postcode, ''))
  END AS value,
  'tenant_addresses' AS source,
  f.source_table || '.' || f.source_column || ' (' || f.source_address_type || ')' AS source_reference
FROM (
  SELECT *,
    ROW_NUMBER() OVER (PARTITION BY tenant_id, address_type ORDER BY created_at DESC) AS rn
  FROM public.tenant_addresses
) ranked
JOIN public.dd_fields f
  ON f.source_table = 'tenant_addresses'
 AND f.source_address_type = ranked.address_type
 AND f.is_active = true
WHERE ranked.rn = 1

UNION ALL

SELECT
  snap.tenant_id,
  f.id AS field_id,
  f.tag AS field_tag,
  f.name AS field_name,
  f.field_type,
  snap.payload->'registrations'->0->>'endDate' AS value,
  'tga_rto_snapshots' AS source,
  'tga_rto_snapshots.payload->registrations->0->endDate' AS source_reference
FROM (
  SELECT *,
    ROW_NUMBER() OVER (PARTITION BY tenant_id ORDER BY created_at DESC) AS rn
  FROM public.tga_rto_snapshots
) snap
JOIN public.dd_fields f
  ON f.source_table = 'tga_rto_snapshots'
 AND f.is_active = true
WHERE snap.rn = 1;

GRANT SELECT ON public.v_tenant_merge_fields TO authenticated;
