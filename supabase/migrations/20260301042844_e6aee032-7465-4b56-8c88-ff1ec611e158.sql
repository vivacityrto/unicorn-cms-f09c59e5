
-- Phase 1a: Extend dd_fields with source-mapping columns
ALTER TABLE public.dd_fields
  ADD COLUMN IF NOT EXISTS source_table text,
  ADD COLUMN IF NOT EXISTS source_column text,
  ADD COLUMN IF NOT EXISTS source_address_type text,
  ADD COLUMN IF NOT EXISTS is_active boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS description text,
  ADD COLUMN IF NOT EXISTS field_type text NOT NULL DEFAULT 'text',
  ADD COLUMN IF NOT EXISTS created_at timestamptz NOT NULL DEFAULT now(),
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

-- Phase 1b: Add logo_path to tenants
ALTER TABLE public.tenants ADD COLUMN IF NOT EXISTS logo_path text;

-- Phase 1c: UPDATE all 24 dd_fields rows with source mappings
UPDATE public.dd_fields SET source_table = 'tenants', source_column = 'logo_path', field_type = 'image', description = 'Organisation logo image' WHERE id = 1;
UPDATE public.dd_fields SET source_table = 'tenants', source_column = 'rto_name', description = 'Registered Training Organisation name' WHERE id = 2;
UPDATE public.dd_fields SET source_table = 'tenant_profile', source_column = 'phone1', description = 'Primary phone number' WHERE id = 3;
UPDATE public.dd_fields SET source_table = 'tenant_profile', source_column = 'rto_email', description = 'Primary email address' WHERE id = 5;
UPDATE public.dd_fields SET source_table = 'tenant_addresses', source_column = 'address1', source_address_type = 'HO', description = 'Head office street address' WHERE id = 6;
UPDATE public.dd_fields SET source_table = 'tenant_addresses', source_column = 'suburb', source_address_type = 'HO', description = 'Head office suburb' WHERE id = 7;
UPDATE public.dd_fields SET source_table = 'tenant_addresses', source_column = 'state', source_address_type = 'HO', description = 'Head office state' WHERE id = 8;
UPDATE public.dd_fields SET source_table = 'tenant_addresses', source_column = 'postcode', source_address_type = 'HO', description = 'Head office postcode' WHERE id = 9;
UPDATE public.dd_fields SET source_table = 'tenant_profile', source_column = 'country', description = 'Country' WHERE id = 10;
UPDATE public.dd_fields SET source_table = 'tenants', source_column = 'acn', description = 'Australian Company Number' WHERE id = 11;
UPDATE public.dd_fields SET source_table = 'tenants', source_column = 'abn', description = 'Australian Business Number' WHERE id = 12;
UPDATE public.dd_fields SET source_table = 'tenants', source_column = 'website', description = 'Organisation website URL' WHERE id = 13;
UPDATE public.dd_fields SET source_table = 'tenants', source_column = 'rto_id', description = 'RTO identifier number' WHERE id = 14;
UPDATE public.dd_fields SET source_table = 'tenants', source_column = 'lms', description = 'Learning Management System' WHERE id = 15;
UPDATE public.dd_fields SET source_table = 'tenants', source_column = 'accounting_system', description = 'Accounting system name' WHERE id = 16;
UPDATE public.dd_fields SET source_table = 'tenant_addresses', source_column = 'full_address', source_address_type = 'DS', description = 'Training/delivery site full address' WHERE id = 17;
UPDATE public.dd_fields SET source_table = 'tenant_addresses', source_column = 'full_address', source_address_type = 'PO', description = 'PO Box full address' WHERE id = 18;
UPDATE public.dd_fields SET source_table = 'tenants', source_column = 'cricos_id', description = 'CRICOS provider ID' WHERE id = 19;
UPDATE public.dd_fields SET source_table = 'tenants', source_column = 'legal_name', description = 'Legal entity name' WHERE id = 20;
UPDATE public.dd_fields SET source_table = 'tga_rto_snapshots', source_column = 'endDate', description = 'RTO registration end date from TGA' WHERE id = 21;
UPDATE public.dd_fields SET source_table = 'tenant_profile', source_column = 'primary_contact_name', description = 'Primary accountable person name' WHERE id = 24;
UPDATE public.dd_fields SET source_table = 'tenant_profile', source_column = 'gto_name', description = 'Group Training Organisation name' WHERE id = 25;
UPDATE public.dd_fields SET source_table = 'tenants', source_column = 'sms', description = 'Student Management System' WHERE id = 26;

-- Phase 1d: Create v_tenant_merge_fields view
CREATE OR REPLACE VIEW public.v_tenant_merge_fields
WITH (security_invoker = true)
AS
-- 1. tenants-sourced fields
SELECT
  t.id AS tenant_id,
  f.id AS field_id,
  f.tag AS field_tag,
  f.name AS field_name,
  f.field_type,
  CASE f.source_column
    WHEN 'logo_path' THEN COALESCE(t.logo_path, '')
    WHEN 'rto_name' THEN COALESCE(t.rto_name, '')
    WHEN 'acn' THEN COALESCE(t.acn, '')
    WHEN 'abn' THEN COALESCE(t.abn, '')
    WHEN 'website' THEN COALESCE(t.website, '')
    WHEN 'rto_id' THEN COALESCE(t.rto_id, '')
    WHEN 'lms' THEN COALESCE(t.lms, '')
    WHEN 'accounting_system' THEN COALESCE(t.accounting_system, '')
    WHEN 'cricos_id' THEN COALESCE(t.cricos_id, '')
    WHEN 'legal_name' THEN COALESCE(t.legal_name, '')
    WHEN 'sms' THEN COALESCE(t.sms, '')
    ELSE ''
  END AS value,
  'tenants'::text AS source
FROM public.tenants t
CROSS JOIN public.dd_fields f
WHERE f.source_table = 'tenants' AND f.is_active = true

UNION ALL

-- 2. tenant_profile-sourced fields
SELECT
  tp.tenant_id,
  f.id AS field_id,
  f.tag AS field_tag,
  f.name AS field_name,
  f.field_type,
  CASE f.source_column
    WHEN 'phone1' THEN COALESCE(tp.phone1, '')
    WHEN 'rto_email' THEN COALESCE(tp.rto_email, '')
    WHEN 'country' THEN COALESCE(tp.country, '')
    WHEN 'primary_contact_name' THEN COALESCE(tp.primary_contact_name, '')
    WHEN 'gto_name' THEN COALESCE(tp.gto_name, '')
    ELSE ''
  END AS value,
  'tenant_profile'::text AS source
FROM public.tenant_profile tp
CROSS JOIN public.dd_fields f
WHERE f.source_table = 'tenant_profile' AND f.is_active = true

UNION ALL

-- 3. tenant_addresses-sourced fields (ranked: latest per tenant per address_type)
SELECT
  ra.tenant_id,
  f.id AS field_id,
  f.tag AS field_tag,
  f.name AS field_name,
  f.field_type,
  CASE f.source_column
    WHEN 'address1' THEN COALESCE(ra.address1, '') || COALESCE(', ' || NULLIF(ra.address2, ''), '')
    WHEN 'suburb' THEN COALESCE(ra.suburb, '')
    WHEN 'state' THEN COALESCE(ra.state, '')
    WHEN 'postcode' THEN COALESCE(ra.postcode, '')
    WHEN 'full_address' THEN COALESCE(ra.full_address, '')
    ELSE ''
  END AS value,
  'tenant_addresses'::text AS source
FROM (
  SELECT *,
    ROW_NUMBER() OVER (PARTITION BY tenant_id, address_type ORDER BY created_at DESC) AS rn
  FROM public.tenant_addresses
  WHERE inactive IS NOT TRUE
) ra
CROSS JOIN public.dd_fields f
WHERE ra.rn = 1
  AND f.source_table = 'tenant_addresses'
  AND f.is_active = true
  AND f.source_address_type = ra.address_type

UNION ALL

-- 4. tga_rto_snapshots-sourced fields (latest snapshot per tenant)
SELECT
  s.tenant_id,
  f.id AS field_id,
  f.tag AS field_tag,
  f.name AS field_name,
  f.field_type,
  COALESCE(s.payload->'registrations'->0->>'endDate', '') AS value,
  'tga_rto_snapshots'::text AS source
FROM (
  SELECT *,
    ROW_NUMBER() OVER (PARTITION BY tenant_id ORDER BY created_at DESC) AS rn
  FROM public.tga_rto_snapshots
) s
CROSS JOIN public.dd_fields f
WHERE s.rn = 1
  AND f.source_table = 'tga_rto_snapshots'
  AND f.is_active = true;

-- Grant access
GRANT SELECT ON public.v_tenant_merge_fields TO authenticated;

-- Phase 1e: Storage RLS policies for client-logos bucket
-- Allow Vivacity staff to upload/update/delete logos
CREATE POLICY "Staff can upload client logos"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'client-logos'
  AND public.is_vivacity_team_safe(auth.uid())
);

CREATE POLICY "Staff can update client logos"
ON storage.objects
FOR UPDATE
TO authenticated
USING (
  bucket_id = 'client-logos'
  AND public.is_vivacity_team_safe(auth.uid())
);

CREATE POLICY "Staff can delete client logos"
ON storage.objects
FOR DELETE
TO authenticated
USING (
  bucket_id = 'client-logos'
  AND public.is_vivacity_team_safe(auth.uid())
);

-- Trigger for updated_at on dd_fields
CREATE OR REPLACE FUNCTION public.update_dd_fields_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

CREATE TRIGGER update_dd_fields_updated_at
BEFORE UPDATE ON public.dd_fields
FOR EACH ROW
EXECUTE FUNCTION public.update_dd_fields_updated_at();
