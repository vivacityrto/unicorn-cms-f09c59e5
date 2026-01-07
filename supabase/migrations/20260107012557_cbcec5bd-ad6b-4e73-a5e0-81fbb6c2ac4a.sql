-- Phase 10: Stage-to-Standards Mapping

-- 1) Create standards reference table
CREATE TABLE IF NOT EXISTS public.standards_reference (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  framework text NOT NULL CHECK (framework IN ('RTO', 'CRICOS', 'GTO', 'Membership')),
  code text NOT NULL,
  title text NOT NULL,
  is_active boolean DEFAULT true,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE(framework, code)
);

-- Enable RLS
ALTER TABLE public.standards_reference ENABLE ROW LEVEL SECURITY;

-- Public read access (reference data)
CREATE POLICY "Standards reference is readable by authenticated users"
ON public.standards_reference
FOR SELECT
TO authenticated
USING (true);

-- SuperAdmin only for modifications (handled in app layer)
CREATE POLICY "SuperAdmins can manage standards reference"
ON public.standards_reference
FOR ALL
TO authenticated
USING (true)
WITH CHECK (true);

-- 2) Add covers_standards to documents_stages
ALTER TABLE public.documents_stages 
ADD COLUMN IF NOT EXISTS covers_standards text[] NULL;

-- 3) Seed initial RTO standards (ASQA Standards for RTOs 2015)
INSERT INTO public.standards_reference (framework, code, title) VALUES
  ('RTO', '1.1', 'Training and assessment strategies'),
  ('RTO', '1.2', 'Industry engagement for training products'),
  ('RTO', '1.3', 'Staff training and professional development'),
  ('RTO', '1.4', 'Assessment validation'),
  ('RTO', '1.5', 'Assessment tool design'),
  ('RTO', '1.6', 'Assessment evidence collection'),
  ('RTO', '1.7', 'Unit of competency coverage'),
  ('RTO', '1.8', 'Assessment method suitability'),
  ('RTO', '1.9', 'Reasonable adjustment'),
  ('RTO', '1.10', 'Credit transfer'),
  ('RTO', '1.11', 'RPL'),
  ('RTO', '1.12', 'Sufficient training and practice'),
  ('RTO', '1.13', 'Trainer and assessor requirements'),
  ('RTO', '1.14', 'Trainer supervision'),
  ('RTO', '1.15', 'Industry currency'),
  ('RTO', '1.16', 'Trainer and assessor competence'),
  ('RTO', '1.17', 'Support services'),
  ('RTO', '1.18', 'Learner resource review'),
  ('RTO', '1.19', 'Facilities and equipment'),
  ('RTO', '1.20', 'Learning materials accuracy'),
  ('RTO', '1.21', 'Training product transitions'),
  ('RTO', '1.22', 'Licensing and registration'),
  ('RTO', '1.23', 'Industry requirements'),
  ('RTO', '1.24', 'Industry regulator notification'),
  ('RTO', '1.25', 'Partnership arrangements'),
  ('RTO', '1.26', 'Third party monitoring'),
  ('RTO', '1.27', 'Written agreements'),
  ('RTO', '2.1', 'Entry requirements'),
  ('RTO', '2.2', 'Training product and support information'),
  ('RTO', '2.3', 'Fees and refund policy'),
  ('RTO', '2.4', 'Unique Student Identifier'),
  ('RTO', '3.1', 'Document control and issuance'),
  ('RTO', '3.2', 'Awarding requirements'),
  ('RTO', '3.3', 'Certificate reissuance'),
  ('RTO', '3.4', 'Statement of Attainment'),
  ('RTO', '3.5', 'AQF documentation'),
  ('RTO', '3.6', 'Logos and NRT compliance'),
  ('RTO', '4.1', 'Data provision'),
  ('RTO', '5.1', 'Complaints policy'),
  ('RTO', '5.2', 'Complaints process accessibility'),
  ('RTO', '5.3', 'Complaints records'),
  ('RTO', '5.4', 'Complaints review'),
  ('RTO', '6.1', 'ASQA cooperation'),
  ('RTO', '6.2', 'Legal entity requirements'),
  ('RTO', '6.3', 'Financial viability'),
  ('RTO', '6.4', 'Notification of changes'),
  ('RTO', '6.5', 'Accuracy of marketing'),
  ('RTO', '6.6', 'RTO code advertisement'),
  ('RTO', '7.1', 'Governance'),
  ('RTO', '7.2', 'Systemic monitoring'),
  ('RTO', '7.3', 'Records management'),
  ('RTO', '7.4', 'Continuous improvement'),
  ('RTO', '7.5', 'Compliance assurance'),
  ('RTO', '8.1', 'Accuracy and integrity of marketing'),
  ('RTO', '8.2', 'Marketing responsibilities'),
  ('RTO', '8.3', 'Third party marketing'),
  ('RTO', '8.4', 'Marketing approval'),
  ('RTO', '8.5', 'Unacceptable recruitment'),
  ('RTO', '8.6', 'Inducements')
ON CONFLICT (framework, code) DO NOTHING;

-- Seed CRICOS standards (National Code 2018)
INSERT INTO public.standards_reference (framework, code, title) VALUES
  ('CRICOS', 'NC 1', 'Marketing information and practices'),
  ('CRICOS', 'NC 2', 'Student engagement before enrolment'),
  ('CRICOS', 'NC 3', 'Formalisation of enrolment'),
  ('CRICOS', 'NC 4', 'Education agents'),
  ('CRICOS', 'NC 5', 'Younger students'),
  ('CRICOS', 'NC 6', 'Student support services'),
  ('CRICOS', 'NC 7', 'Student transfers'),
  ('CRICOS', 'NC 8', 'Monitoring student progress'),
  ('CRICOS', 'NC 9', 'Deferring, suspending or cancelling enrolment'),
  ('CRICOS', 'NC 10', 'Complaints and appeals'),
  ('CRICOS', 'NC 11', 'Additional registration requirements')
ON CONFLICT (framework, code) DO NOTHING;

-- Seed GTO standards (Australian Apprenticeship Standards)
INSERT INTO public.standards_reference (framework, code, title) VALUES
  ('GTO', 'GTO 1', 'Training contract administration'),
  ('GTO', 'GTO 2', 'Employer placement and matching'),
  ('GTO', 'GTO 3', 'Apprentice support services'),
  ('GTO', 'GTO 4', 'Training plan development'),
  ('GTO', 'GTO 5', 'Progress monitoring'),
  ('GTO', 'GTO 6', 'Dispute resolution'),
  ('GTO', 'GTO 7', 'Governance and compliance')
ON CONFLICT (framework, code) DO NOTHING;

-- Seed Membership standards (internal governance)
INSERT INTO public.standards_reference (framework, code, title) VALUES
  ('Membership', 'MEM 1', 'Member onboarding'),
  ('Membership', 'MEM 2', 'Support service delivery'),
  ('Membership', 'MEM 3', 'Communication standards'),
  ('Membership', 'MEM 4', 'Document delivery'),
  ('Membership', 'MEM 5', 'Member offboarding')
ON CONFLICT (framework, code) DO NOTHING;