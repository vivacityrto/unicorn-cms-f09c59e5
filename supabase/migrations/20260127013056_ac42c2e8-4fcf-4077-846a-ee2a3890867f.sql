-- Create a view to expose eos_issue_status enum values as single source of truth
CREATE OR REPLACE VIEW public.eos_issue_status_options AS
SELECT unnest(enum_range(NULL::eos_issue_status))::text AS value;

-- Grant read access to authenticated users
GRANT SELECT ON public.eos_issue_status_options TO authenticated;
GRANT SELECT ON public.eos_issue_status_options TO anon;