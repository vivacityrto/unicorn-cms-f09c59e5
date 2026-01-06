-- Create system_reference_lists table for static dropdown values
CREATE TABLE IF NOT EXISTS public.system_reference_lists (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  list_key text NOT NULL UNIQUE,
  display_name text NOT NULL,
  values text[] NOT NULL DEFAULT '{}',
  description text,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Add common reference lists
INSERT INTO public.system_reference_lists (list_key, display_name, values, description)
VALUES 
  ('australian_states', 'Australian States', ARRAY['NSW', 'VIC', 'QLD', 'SA', 'WA', 'TAS', 'ACT', 'NT'], 'Australian states and territories'),
  ('delivery_modes', 'Delivery Modes', ARRAY['Face to face', 'Online', 'Blended', 'Workplace', 'Distance', 'Mixed'], 'Training delivery modes'),
  ('assessment_methods', 'Assessment Methods', ARRAY['Written', 'Practical', 'Observation', 'Portfolio', 'Third Party', 'RPL'], 'Assessment method types'),
  ('student_statuses', 'Student Statuses', ARRAY['Enrolled', 'Active', 'Deferred', 'Withdrawn', 'Completed', 'Cancelled'], 'Student enrollment statuses'),
  ('yes_no', 'Yes/No Options', ARRAY['Yes', 'No'], 'Simple yes/no dropdown'),
  ('yes_no_na', 'Yes/No/NA Options', ARRAY['Yes', 'No', 'N/A'], 'Yes/No with not applicable option'),
  ('compliance_ratings', 'Compliance Ratings', ARRAY['Compliant', 'Non-Compliant', 'Partially Compliant', 'Not Assessed'], 'Audit compliance ratings'),
  ('risk_levels', 'Risk Levels', ARRAY['Low', 'Medium', 'High', 'Critical'], 'Risk assessment levels'),
  ('document_statuses', 'Document Statuses', ARRAY['Draft', 'Under Review', 'Approved', 'Published', 'Archived', 'Superseded'], 'Document lifecycle statuses'),
  ('trainer_qualifications', 'Trainer Qualification Status', ARRAY['Fully Qualified', 'Working Towards', 'Industry Expert', 'Not Verified'], 'Trainer qualification statuses')
ON CONFLICT (list_key) DO NOTHING;

-- Enable RLS
ALTER TABLE public.system_reference_lists ENABLE ROW LEVEL SECURITY;

-- Anyone authenticated can read reference lists
CREATE POLICY "Authenticated users can read reference lists"
  ON public.system_reference_lists
  FOR SELECT
  TO authenticated
  USING (is_active = true);

-- Only Super Admins can manage reference lists
CREATE POLICY "Super Admins can manage reference lists"
  ON public.system_reference_lists
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.users
      WHERE users.user_uuid = auth.uid()
      AND users.unicorn_role = 'Super Admin'
    )
  );

-- Create index for quick lookups
CREATE INDEX IF NOT EXISTS idx_system_reference_lists_key ON public.system_reference_lists(list_key) WHERE is_active = true;

-- Create trigger to update updated_at
CREATE OR REPLACE FUNCTION public.update_system_reference_lists_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_system_reference_lists_timestamp
  BEFORE UPDATE ON public.system_reference_lists
  FOR EACH ROW
  EXECUTE FUNCTION public.update_system_reference_lists_updated_at();