-- Fix security definer warning on new option views by explicitly setting security invoker
-- These are read-only option lists that don't require any special permissions

DROP VIEW IF EXISTS public.eos_issue_category_options;
DROP VIEW IF EXISTS public.eos_issue_impact_options;
DROP VIEW IF EXISTS public.eos_issue_type_options;
DROP VIEW IF EXISTS public.eos_quarter_options;

-- Recreate with explicit SECURITY INVOKER
CREATE VIEW public.eos_issue_category_options 
WITH (security_invoker = true) AS
SELECT unnest(ARRAY[
  'Delivery',
  'Compliance',
  'Financial',
  'Capacity',
  'Systems',
  'Client',
  'Strategic',
  'Growth'
]) AS value;

CREATE VIEW public.eos_issue_impact_options 
WITH (security_invoker = true) AS
SELECT unnest(ARRAY[
  'Low',
  'Medium',
  'High',
  'Critical'
]) AS value;

CREATE VIEW public.eos_issue_type_options 
WITH (security_invoker = true) AS
SELECT unnest(ARRAY[
  'risk',
  'opportunity'
]) AS value;

CREATE VIEW public.eos_quarter_options 
WITH (security_invoker = true) AS
SELECT generate_series(1, 4) AS value;

-- Re-grant permissions
GRANT SELECT ON public.eos_issue_category_options TO authenticated, anon;
GRANT SELECT ON public.eos_issue_impact_options TO authenticated, anon;
GRANT SELECT ON public.eos_issue_type_options TO authenticated, anon;
GRANT SELECT ON public.eos_quarter_options TO authenticated, anon;

-- Also fix the existing status options view
DROP VIEW IF EXISTS public.eos_issue_status_options;
CREATE VIEW public.eos_issue_status_options 
WITH (security_invoker = true) AS
SELECT unnest(enum_range(NULL::eos_issue_status))::text AS value;
GRANT SELECT ON public.eos_issue_status_options TO authenticated, anon;