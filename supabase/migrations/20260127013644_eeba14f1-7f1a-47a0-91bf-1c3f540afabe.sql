-- Create views to expose EOS option values as single source of truth
-- These provide read-only access to valid option values for dropdowns

-- Category options (stored as text, but we define valid values)
CREATE OR REPLACE VIEW public.eos_issue_category_options AS
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

-- Impact options (stored as text)
CREATE OR REPLACE VIEW public.eos_issue_impact_options AS
SELECT unnest(ARRAY[
  'Low',
  'Medium',
  'High',
  'Critical'
]) AS value;

-- Item type options (risk vs opportunity)
CREATE OR REPLACE VIEW public.eos_issue_type_options AS
SELECT unnest(ARRAY[
  'risk',
  'opportunity'
]) AS value;

-- Quarter options (Q1-Q4 as integers)
CREATE OR REPLACE VIEW public.eos_quarter_options AS
SELECT generate_series(1, 4) AS value;

-- Grant read access to all option views
GRANT SELECT ON public.eos_issue_category_options TO authenticated;
GRANT SELECT ON public.eos_issue_category_options TO anon;
GRANT SELECT ON public.eos_issue_impact_options TO authenticated;
GRANT SELECT ON public.eos_issue_impact_options TO anon;
GRANT SELECT ON public.eos_issue_type_options TO authenticated;
GRANT SELECT ON public.eos_issue_type_options TO anon;
GRANT SELECT ON public.eos_quarter_options TO authenticated;
GRANT SELECT ON public.eos_quarter_options TO anon;