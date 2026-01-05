-- Add package_type and progress_mode columns to packages table
ALTER TABLE public.packages 
ADD COLUMN IF NOT EXISTS package_type text DEFAULT 'project',
ADD COLUMN IF NOT EXISTS progress_mode text DEFAULT 'stage_completion';

-- Add stage_type and dashboard_visible columns to documents_stages table
ALTER TABLE public.documents_stages 
ADD COLUMN IF NOT EXISTS stage_type text DEFAULT 'delivery',
ADD COLUMN IF NOT EXISTS dashboard_visible boolean DEFAULT true;

-- Create index for efficient filtering
CREATE INDEX IF NOT EXISTS idx_packages_package_type ON public.packages(package_type);
CREATE INDEX IF NOT EXISTS idx_documents_stages_stage_type ON public.documents_stages(stage_type);
CREATE INDEX IF NOT EXISTS idx_documents_stages_dashboard_visible ON public.documents_stages(dashboard_visible);

-- Backfill package_type and progress_mode for existing packages

-- Membership packages (perpetual) - RTO tiers
UPDATE public.packages SET package_type = 'membership', progress_mode = 'entitlement_milestone' 
WHERE name IN ('M-AM', 'M-GR', 'M-RR', 'M-SAR', 'M-DR');

-- Membership packages (perpetual) - CRICOS tiers  
UPDATE public.packages SET package_type = 'membership', progress_mode = 'entitlement_milestone' 
WHERE name IN ('M-GC', 'M-RC', 'M-SAC', 'M-DC');

-- CHC: package_type=audit, progress_mode=milestone_based
UPDATE public.packages SET package_type = 'audit', progress_mode = 'milestone_based' WHERE name = 'CHC';

-- DD: package_type=audit, progress_mode=phase_based (if exists)
UPDATE public.packages SET package_type = 'audit', progress_mode = 'phase_based' WHERE name = 'DD';

-- AV: package_type=audit, progress_mode=milestone_based (if exists)
UPDATE public.packages SET package_type = 'audit', progress_mode = 'milestone_based' WHERE name = 'AV';

-- ACC: package_type=project, progress_mode=stage_completion
UPDATE public.packages SET package_type = 'project', progress_mode = 'stage_completion' WHERE name = 'ACC';

-- KS-RTO: package_type=regulatory_submission, progress_mode=phase_based
UPDATE public.packages SET package_type = 'regulatory_submission', progress_mode = 'phase_based' WHERE name = 'KS-RTO';

-- KS-CRI: package_type=regulatory_submission, progress_mode=phase_based
UPDATE public.packages SET package_type = 'regulatory_submission', progress_mode = 'phase_based' WHERE name = 'KS-CRI';

-- KS-GTO: package_type=regulatory_submission, progress_mode=stage_completion
UPDATE public.packages SET package_type = 'regulatory_submission', progress_mode = 'stage_completion' WHERE name = 'KS-GTO';

-- FT-St: package_type=regulatory_submission, progress_mode=phase_based (if exists)
UPDATE public.packages SET package_type = 'regulatory_submission', progress_mode = 'phase_based' WHERE name = 'FT-St';

-- Backfill stage_type for documents_stages based on stage name mapping

-- Setup stages
UPDATE public.documents_stages SET stage_type = 'setup' 
WHERE title IN ('Setup Client', 'Setup for Membership', 'VA Team Setup', 'GTO Setup');

-- Delivery stages
UPDATE public.documents_stages SET stage_type = 'delivery' 
WHERE title IN (
  'Strategic Business Planning', 'Business Plan', 'TAS - KickStart', 'CRICOS Requirements',
  'Transfer of Ownership', 'Re-accreditation (TAC WA)', 'Research and Concept Development',
  'Course Development', 'GTO Setup', 'GTO Documents', 'GTO Documents - VIC', 'GTO Documents - NSW',
  'Recruitment, Employment and Induction', 'Recruitment, Employment & Induction',
  'GTO Governance and Administration', 'TAS', 'TAS - ReBoot', 'TAS - AddOn',
  'RTO Documentation - 2015', 'CRICOS Documentation', 'RTO Compliance', 'CRICOS Compliance',
  'Client Induction', 'Welcome & Access', 'Training and Assessment Strategy',
  'Monitoring and Support for Apprentices and Trainees', 'GTO-Documents'
);

-- Review stages
UPDATE public.documents_stages SET stage_type = 'review' 
WHERE title IN ('Risk Assessment', 'Mock Audit', 'Assessment Validation', 'Compliance Health Check', 
                'CRICOS Systems Check', 'SystemsCheck - ReBoot');

-- Submission stages
UPDATE public.documents_stages SET stage_type = 'submission' 
WHERE title IN ('Mock Audit & Submission', 'Financial Viability & ASQAnet RTO', 
                'Financial Viability & ASQAnet CRICOS', 'Course Design & Submission',
                'Financial Viability and ASQAnet - AddOn', 'ASQAnet - ReBoot', 'ASQAnet - AddOn',
                'Registration');

-- Waiting stages
UPDATE public.documents_stages SET stage_type = 'waiting' 
WHERE title IN ('Post Submission', 'ASQA Audit', 'GTO Audit', 'Reconsideration');

-- Entitlement stages (for memberships)
UPDATE public.documents_stages SET stage_type = 'entitlement' 
WHERE title IN ('RTO Documentation - 2025', 'Professional Development', 'Vivacity Training');

-- Recurring stages
UPDATE public.documents_stages SET stage_type = 'recurring' 
WHERE title IN ('Consultation Hours', 'Monthly Consultation');

-- Closeout stages - also hide from dashboard
UPDATE public.documents_stages 
SET stage_type = 'closeout', dashboard_visible = false 
WHERE title IN ('Finalise Client', 'Finalise client', 'Finalising');

-- Also hide Renewal of Membership from dashboard (not applicable for perpetual memberships)
UPDATE public.documents_stages SET dashboard_visible = false WHERE title = 'Renewal of Membership';

-- Add comments for documentation
COMMENT ON COLUMN public.packages.package_type IS 'Type of package: membership, audit, project, regulatory_submission';
COMMENT ON COLUMN public.packages.progress_mode IS 'How progress is tracked: stage_completion, phase_based, milestone_based, entitlement_milestone';
COMMENT ON COLUMN public.documents_stages.stage_type IS 'Type of stage: setup, delivery, review, submission, waiting, entitlement, recurring, closeout';
COMMENT ON COLUMN public.documents_stages.dashboard_visible IS 'Whether this stage should be visible on the dashboard';