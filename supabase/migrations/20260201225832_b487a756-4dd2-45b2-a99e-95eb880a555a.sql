-- Recreate EOS option views with security invoker

-- Type options (risk/opportunity)
CREATE VIEW public.eos_issue_type_options 
WITH (security_invoker = true) AS
SELECT unnest(ARRAY['risk', 'opportunity']) AS value;

-- Category options
CREATE VIEW public.eos_issue_category_options 
WITH (security_invoker = true) AS
SELECT unnest(ARRAY[
  'Delivery', 'Compliance', 'Financial', 'Capacity',
  'Systems', 'Client', 'Strategic', 'Growth'
]) AS value;

-- Impact options
CREATE VIEW public.eos_issue_impact_options 
WITH (security_invoker = true) AS
SELECT unnest(ARRAY['Low', 'Medium', 'High', 'Critical']) AS value;

-- Status options (from enum)
CREATE VIEW public.eos_issue_status_options 
WITH (security_invoker = true) AS
SELECT unnest(enum_range(NULL::eos_issue_status))::text AS value;

-- Quarter options (1-4)
CREATE VIEW public.eos_quarter_options 
WITH (security_invoker = true) AS
SELECT generate_series(1, 4) AS value;

-- Grant permissions
GRANT SELECT ON public.eos_issue_type_options TO authenticated, anon;
GRANT SELECT ON public.eos_issue_category_options TO authenticated, anon;
GRANT SELECT ON public.eos_issue_impact_options TO authenticated, anon;
GRANT SELECT ON public.eos_issue_status_options TO authenticated, anon;
GRANT SELECT ON public.eos_quarter_options TO authenticated, anon;

-- Create status transitions table
CREATE TABLE public.eos_issue_status_transitions (
  from_status eos_issue_status NOT NULL,
  to_status eos_issue_status NOT NULL,
  PRIMARY KEY (from_status, to_status)
);

-- Enable RLS and grant read access
ALTER TABLE public.eos_issue_status_transitions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone can read transitions"
  ON public.eos_issue_status_transitions FOR SELECT
  TO authenticated USING (true);

-- Insert allowed transitions
INSERT INTO public.eos_issue_status_transitions (from_status, to_status) VALUES
  ('Open', 'Discussing'), ('Open', 'In Review'), ('Open', 'Archived'),
  ('Discussing', 'Actioning'), ('Discussing', 'Solved'), ('Discussing', 'Open'),
  ('In Review', 'Actioning'), ('In Review', 'Escalated'), ('In Review', 'Open'),
  ('Actioning', 'Solved'), ('Actioning', 'Escalated'), ('Actioning', 'Discussing'),
  ('Escalated', 'Actioning'), ('Escalated', 'Closed'), ('Escalated', 'Archived'),
  ('Solved', 'Closed'), ('Solved', 'Archived'),
  ('Closed', 'Archived'), ('Archived', 'Open');