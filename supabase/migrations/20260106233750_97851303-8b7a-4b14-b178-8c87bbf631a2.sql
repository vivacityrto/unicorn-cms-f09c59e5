-- ============================================================
-- A1. Backfill and enforce NOT NULL for is_certified
-- ============================================================

-- Update any NULL is_certified to false
UPDATE public.documents_stages 
SET is_certified = false 
WHERE is_certified IS NULL;

-- Alter column to NOT NULL
ALTER TABLE public.documents_stages 
ALTER COLUMN is_certified SET NOT NULL;

-- Add index for filtering
CREATE INDEX IF NOT EXISTS idx_documents_stages_is_certified 
ON public.documents_stages(is_certified);

-- ============================================================
-- A2. Add stable stage_key column
-- ============================================================

-- Add column (initially nullable)
ALTER TABLE public.documents_stages 
ADD COLUMN IF NOT EXISTS stage_key text;

-- Backfill stage_key for existing rows using slugified title + id suffix
UPDATE public.documents_stages
SET stage_key = lower(regexp_replace(title, '[^a-zA-Z0-9]+', '-', 'g')) || '-' || id
WHERE stage_key IS NULL;

-- Set specific canonical stage_keys for known stages (update by matching title patterns)
-- These will be the stable identifiers used by recommended stages logic
UPDATE public.documents_stages
SET stage_key = 'onboarding-client-commencement'
WHERE lower(title) = 'onboarding – client commencement' 
  OR lower(title) = 'onboarding - client commencement'
  OR (lower(title) LIKE '%onboarding%client%commencement%' AND is_certified = true);

UPDATE public.documents_stages
SET stage_key = 'rto-documentation-2025'
WHERE lower(title) = 'rto documentation – 2025' 
  OR lower(title) = 'rto documentation - 2025'
  OR (lower(title) LIKE '%rto%documentation%2025%' AND is_certified = true);

UPDATE public.documents_stages
SET stage_key = 'offboarding-client-closure'
WHERE lower(title) = 'offboarding – client closure' 
  OR lower(title) = 'offboarding - client closure'
  OR (lower(title) LIKE '%offboarding%client%closure%' AND is_certified = true);

UPDATE public.documents_stages
SET stage_key = 'membership-support-ongoing'
WHERE lower(title) = 'membership support – ongoing' 
  OR lower(title) = 'membership support - ongoing'
  OR (lower(title) LIKE '%membership%support%ongoing%' AND is_certified = true);

-- Handle any remaining duplicates by appending id suffix
WITH duplicates AS (
  SELECT id, stage_key, ROW_NUMBER() OVER (PARTITION BY stage_key ORDER BY is_certified DESC, id ASC) as rn
  FROM public.documents_stages
  WHERE stage_key IS NOT NULL
)
UPDATE public.documents_stages ds
SET stage_key = ds.stage_key || '-' || ds.id
FROM duplicates d
WHERE ds.id = d.id AND d.rn > 1;

-- Enforce NOT NULL
ALTER TABLE public.documents_stages 
ALTER COLUMN stage_key SET NOT NULL;

-- Add unique constraint
CREATE UNIQUE INDEX IF NOT EXISTS uq_documents_stages_stage_key 
ON public.documents_stages(stage_key);

-- ============================================================
-- A3. Add unique constraint to package_stages (prevent duplicates)
-- ============================================================

-- Remove any existing duplicates first (keep the one with lowest id)
DELETE FROM public.package_stages ps1
USING public.package_stages ps2
WHERE ps1.package_id = ps2.package_id 
  AND ps1.stage_id = ps2.stage_id 
  AND ps1.id > ps2.id;

-- Add unique constraint
CREATE UNIQUE INDEX IF NOT EXISTS uq_package_stages_package_stage 
ON public.package_stages(package_id, stage_id);

-- ============================================================
-- B) RPC for SuperAdmin-only certification updates
-- ============================================================

-- Helper function to check if current user is SuperAdmin
CREATE OR REPLACE FUNCTION public.is_super_admin()
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM public.users 
    WHERE user_uuid = auth.uid() 
    AND global_role = 'SuperAdmin'
  );
END;
$$;

-- RPC function to update stage certification (SuperAdmin only)
CREATE OR REPLACE FUNCTION public.update_stage_certification(
  p_stage_id integer,
  p_is_certified boolean,
  p_certified_notes text DEFAULT NULL
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_old_certified boolean;
  v_old_notes text;
BEGIN
  -- Check if user is SuperAdmin
  IF NOT is_super_admin() THEN
    RAISE EXCEPTION 'Permission denied: Only SuperAdmin can update certification status';
  END IF;

  -- Get current values for audit logging
  SELECT is_certified, certified_notes 
  INTO v_old_certified, v_old_notes
  FROM public.documents_stages
  WHERE id = p_stage_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Stage not found';
  END IF;

  -- Update the stage
  UPDATE public.documents_stages
  SET 
    is_certified = p_is_certified,
    certified_notes = CASE WHEN p_is_certified THEN p_certified_notes ELSE NULL END
  WHERE id = p_stage_id;

  -- Log to audit (if audit_events table exists and has appropriate structure)
  BEGIN
    INSERT INTO public.audit_events (
      entity,
      entity_id,
      action,
      user_id,
      details
    ) VALUES (
      'stage',
      p_stage_id::text,
      'certification_updated',
      auth.uid(),
      jsonb_build_object(
        'old_is_certified', v_old_certified,
        'new_is_certified', p_is_certified,
        'old_certified_notes', v_old_notes,
        'new_certified_notes', p_certified_notes
      )
    );
  EXCEPTION WHEN OTHERS THEN
    -- Ignore audit logging errors (table may not exist or have different schema)
    NULL;
  END;

  RETURN json_build_object(
    'success', true,
    'stage_id', p_stage_id,
    'is_certified', p_is_certified
  );
END;
$$;

-- Grant execute permission
GRANT EXECUTE ON FUNCTION public.update_stage_certification(integer, boolean, text) TO authenticated;