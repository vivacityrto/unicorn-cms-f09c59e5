
-- ============================================================================
-- Fix QC Visibility: Drop leftover permissive policies from 20260204
-- These old "Vivacity team can ..." policies use is_vivacity_team_user()
-- and grant all Vivacity staff INSERT/UPDATE/DELETE (which implicitly allows
-- reads via FOR ALL-like behavior). The proper eos_qc_select and eos_qc_manage
-- policies from 20260310 are already in place and restrict access correctly.
-- ============================================================================

-- Drop the leftover permissive policies that were never cleaned up
DROP POLICY IF EXISTS "Vivacity team can insert qc" ON public.eos_qc;
DROP POLICY IF EXISTS "Vivacity team can update qc" ON public.eos_qc;
DROP POLICY IF EXISTS "Vivacity team can delete qc" ON public.eos_qc;

-- Also drop any leftover view policy just in case
DROP POLICY IF EXISTS "Vivacity team can view qc" ON public.eos_qc;
