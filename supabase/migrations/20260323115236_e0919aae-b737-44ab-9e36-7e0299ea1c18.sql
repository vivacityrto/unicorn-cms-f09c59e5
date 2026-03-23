
-- Create a dynamic merge field resolver function
-- This replaces the hardcoded CASE/WHEN logic in v_tenant_merge_fields
-- New fields added to dd_fields will automatically resolve without migrations

CREATE OR REPLACE FUNCTION resolve_tenant_merge_fields(p_tenant_id bigint)
RETURNS TABLE(
  tenant_id bigint,
  field_id integer,
  field_tag text,
  field_name text,
  field_type text,
  value text,
  source text,
  source_reference text
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  rec RECORD;
  col_val text;
BEGIN
  FOR rec IN
    SELECT f.id, f.tag, f.name, f.field_type, f.source_table, f.source_column, f.source_address_type
    FROM dd_fields f
    WHERE f.is_active = true
  LOOP
    col_val := NULL;

    IF rec.source_table = 'tenants' THEN
      EXECUTE format('SELECT %I::text FROM tenants WHERE id = $1', rec.source_column)
        INTO col_val USING p_tenant_id;

      RETURN QUERY SELECT p_tenant_id, rec.id, rec.tag, rec.name, rec.field_type, col_val,
        'tenants'::text, (rec.source_table || '.' || rec.source_column)::text;

    ELSIF rec.source_table = 'tenant_profile' THEN
      EXECUTE format('SELECT %I::text FROM tenant_profile WHERE tenant_id = $1 LIMIT 1', rec.source_column)
        INTO col_val USING p_tenant_id;

      RETURN QUERY SELECT p_tenant_id, rec.id, rec.tag, rec.name, rec.field_type, col_val,
        'tenant_profile'::text, (rec.source_table || '.' || rec.source_column)::text;

    ELSIF rec.source_table = 'tenant_addresses' THEN
      IF rec.source_column = 'full_address' THEN
        SELECT concat_ws(', ',
          NULLIF(ta.address1, ''), NULLIF(ta.address2, ''),
          NULLIF(ta.suburb, ''), NULLIF(ta.state, ''), NULLIF(ta.postcode, ''))
        INTO col_val
        FROM tenant_addresses ta
        WHERE ta.tenant_id = p_tenant_id
          AND ta.address_type = rec.source_address_type
        ORDER BY ta.created_at DESC LIMIT 1;
      ELSIF rec.source_column = 'address1' THEN
        SELECT ta.address1 || COALESCE(', ' || ta.address2, '')
        INTO col_val
        FROM tenant_addresses ta
        WHERE ta.tenant_id = p_tenant_id
          AND ta.address_type = rec.source_address_type
        ORDER BY ta.created_at DESC LIMIT 1;
      ELSE
        EXECUTE format(
          'SELECT %I::text FROM tenant_addresses WHERE tenant_id = $1 AND address_type = $2 ORDER BY created_at DESC LIMIT 1',
          rec.source_column
        ) INTO col_val USING p_tenant_id, rec.source_address_type;
      END IF;

      RETURN QUERY SELECT p_tenant_id, rec.id, rec.tag, rec.name, rec.field_type, col_val,
        'tenant_addresses'::text,
        (rec.source_table || '.' || rec.source_column || ' (' || COALESCE(rec.source_address_type, '') || ')')::text;

    ELSIF rec.source_table = 'tga_rto_snapshots' THEN
      SELECT ((snap.payload -> 'registrations') -> 0) ->> 'endDate'
      INTO col_val
      FROM tga_rto_snapshots snap
      WHERE snap.tenant_id = p_tenant_id
      ORDER BY snap.created_at DESC LIMIT 1;

      RETURN QUERY SELECT p_tenant_id, rec.id, rec.tag, rec.name, rec.field_type, col_val,
        'tga_rto_snapshots'::text,
        'tga_rto_snapshots.payload->registrations->0->endDate'::text;

    END IF;
  END LOOP;
END;
$$;

-- Recreate the view using the dynamic function for backward compatibility
DROP VIEW IF EXISTS v_tenant_merge_fields;

CREATE VIEW v_tenant_merge_fields AS
  SELECT r.*
  FROM tenants t
  CROSS JOIN LATERAL resolve_tenant_merge_fields(t.id) r;
