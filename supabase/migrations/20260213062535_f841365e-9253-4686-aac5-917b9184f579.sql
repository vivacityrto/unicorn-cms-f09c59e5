
-- ============================================================
-- Tenant Identity: canonical identifiers, aliases, and
-- duplicate-detection helpers
-- ============================================================

-- 1. tenant_identifiers: one row per ABN / RTO ID / CRICOS ID
CREATE TABLE IF NOT EXISTS public.tenant_identifiers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id bigint NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  identifier_type text NOT NULL,
  identifier_value text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid NULL
);

ALTER TABLE public.tenant_identifiers
  ADD CONSTRAINT tenant_identifiers_type_check
  CHECK (identifier_type IN ('abn','rto_id','cricos_id'));

-- Unique per type+value (normalised)
CREATE UNIQUE INDEX IF NOT EXISTS ux_tenant_identifier_type_value
  ON public.tenant_identifiers (identifier_type, lower(trim(identifier_value)));

-- Fast lookup by tenant
CREATE INDEX IF NOT EXISTS idx_tenant_identifiers_tenant
  ON public.tenant_identifiers (tenant_id);

ALTER TABLE public.tenant_identifiers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Vivacity can manage identifiers"
  ON public.tenant_identifiers FOR ALL
  USING (public.is_vivacity());

-- 2. tenant_identifier_aliases: keeps history after merges
CREATE TABLE IF NOT EXISTS public.tenant_identifier_aliases (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id bigint NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  identifier_type text NOT NULL,
  identifier_value text NOT NULL,
  source_tenant_id bigint NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.tenant_identifier_aliases ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Vivacity can manage identifier aliases"
  ON public.tenant_identifier_aliases FOR ALL
  USING (public.is_vivacity());

-- 3. Normalisation helpers (immutable for index use)
CREATE OR REPLACE FUNCTION public.normalise_abn(p text)
RETURNS text LANGUAGE sql IMMUTABLE AS $$
  SELECT lpad(regexp_replace(coalesce(p,''), '[^0-9]', '', 'g'), 11, '0')
$$;

CREATE OR REPLACE FUNCTION public.normalise_name(p text)
RETURNS text LANGUAGE sql IMMUTABLE AS $$
  SELECT regexp_replace(lower(trim(coalesce(p,''))), '\s+', ' ', 'g')
$$;

-- 4. Trigger: normalise ABN on insert/update in tenant_identifiers
CREATE OR REPLACE FUNCTION public.trg_normalise_tenant_identifier()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.identifier_type = 'abn' THEN
    NEW.identifier_value := public.normalise_abn(NEW.identifier_value);
    IF length(NEW.identifier_value) <> 11 THEN
      RAISE EXCEPTION 'ABN must be exactly 11 digits after normalisation';
    END IF;
  ELSE
    NEW.identifier_value := trim(NEW.identifier_value);
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER normalise_identifier_before_upsert
  BEFORE INSERT OR UPDATE ON public.tenant_identifiers
  FOR EACH ROW EXECUTE FUNCTION public.trg_normalise_tenant_identifier();

-- 5. Duplicate detection RPC
--    Returns: { hard_block: bool, matches: [{tenant_id, name, match_type, identifiers}] }
CREATE OR REPLACE FUNCTION public.check_tenant_duplicates(
  p_abn text DEFAULT NULL,
  p_rto_id text DEFAULT NULL,
  p_legal_name text DEFAULT NULL,
  p_trading_name text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_norm_abn text;
  v_norm_rto text;
  v_norm_legal text;
  v_norm_trading text;
  v_matches jsonb := '[]'::jsonb;
  v_hard_block boolean := false;
  v_row record;
BEGIN
  -- Only authenticated users
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  -- Normalise inputs
  v_norm_abn := CASE WHEN p_abn IS NOT NULL AND trim(p_abn) <> ''
    THEN public.normalise_abn(p_abn) ELSE NULL END;
  v_norm_rto := CASE WHEN p_rto_id IS NOT NULL AND trim(p_rto_id) <> ''
    THEN lower(trim(p_rto_id)) ELSE NULL END;
  v_norm_legal := CASE WHEN p_legal_name IS NOT NULL AND trim(p_legal_name) <> ''
    THEN public.normalise_name(p_legal_name) ELSE NULL END;
  v_norm_trading := CASE WHEN p_trading_name IS NOT NULL AND trim(p_trading_name) <> ''
    THEN public.normalise_name(p_trading_name) ELSE NULL END;

  -- Check ABN (hard block)
  IF v_norm_abn IS NOT NULL AND length(v_norm_abn) = 11 THEN
    FOR v_row IN
      SELECT ti.tenant_id, t.name, t.legal_name, t.rto_id, t.abn
      FROM tenant_identifiers ti
      JOIN tenants t ON t.id = ti.tenant_id
      WHERE ti.identifier_type = 'abn'
        AND lower(trim(ti.identifier_value)) = v_norm_abn
    LOOP
      v_hard_block := true;
      v_matches := v_matches || jsonb_build_object(
        'tenant_id', v_row.tenant_id,
        'name', v_row.name,
        'legal_name', v_row.legal_name,
        'match_type', 'abn',
        'matched_value', v_row.abn
      );
    END LOOP;
  END IF;

  -- If ABN blocked, return immediately
  IF v_hard_block THEN
    RETURN jsonb_build_object('hard_block', true, 'block_reason', 'abn', 'matches', v_matches);
  END IF;

  -- Check RTO ID (hard block)
  IF v_norm_rto IS NOT NULL THEN
    FOR v_row IN
      SELECT ti.tenant_id, t.name, t.legal_name, t.rto_id, t.abn
      FROM tenant_identifiers ti
      JOIN tenants t ON t.id = ti.tenant_id
      WHERE ti.identifier_type = 'rto_id'
        AND lower(trim(ti.identifier_value)) = v_norm_rto
    LOOP
      v_hard_block := true;
      v_matches := v_matches || jsonb_build_object(
        'tenant_id', v_row.tenant_id,
        'name', v_row.name,
        'legal_name', v_row.legal_name,
        'match_type', 'rto_id',
        'matched_value', v_row.rto_id
      );
    END LOOP;
  END IF;

  IF v_hard_block THEN
    RETURN jsonb_build_object('hard_block', true, 'block_reason', 'rto_id', 'matches', v_matches);
  END IF;

  -- Soft name match (warning only)
  IF v_norm_legal IS NOT NULL THEN
    FOR v_row IN
      SELECT t.id AS tenant_id, t.name, t.legal_name, t.rto_id, t.abn
      FROM tenants t
      WHERE t.status = 'active'
        AND (
          public.normalise_name(t.legal_name) = v_norm_legal
          OR public.normalise_name(t.name) = v_norm_legal
          OR (v_norm_trading IS NOT NULL AND (
            public.normalise_name(t.legal_name) = v_norm_trading
            OR public.normalise_name(t.name) = v_norm_trading
          ))
        )
    LOOP
      v_matches := v_matches || jsonb_build_object(
        'tenant_id', v_row.tenant_id,
        'name', v_row.name,
        'legal_name', v_row.legal_name,
        'match_type', 'name',
        'matched_value', coalesce(v_row.legal_name, v_row.name)
      );
    END LOOP;
  END IF;

  RETURN jsonb_build_object(
    'hard_block', false,
    'matches', v_matches
  );
END;
$$;

-- 6. Backfill existing tenant identifiers from tenants table
INSERT INTO public.tenant_identifiers (tenant_id, identifier_type, identifier_value)
SELECT id, 'rto_id', trim(rto_id)
FROM public.tenants
WHERE rto_id IS NOT NULL AND trim(rto_id) <> ''
ON CONFLICT DO NOTHING;

INSERT INTO public.tenant_identifiers (tenant_id, identifier_type, identifier_value)
SELECT id, 'abn', public.normalise_abn(abn)
FROM public.tenants
WHERE abn IS NOT NULL AND trim(abn) <> ''
  AND length(public.normalise_abn(abn)) = 11
ON CONFLICT DO NOTHING;

INSERT INTO public.tenant_identifiers (tenant_id, identifier_type, identifier_value)
SELECT id, 'cricos_id', trim(cricos_id)
FROM public.tenants
WHERE cricos_id IS NOT NULL AND trim(cricos_id) <> ''
ON CONFLICT DO NOTHING;
