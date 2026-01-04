-- Seed data for Resource Hub testing
-- Insert placeholder resources for each category

INSERT INTO public.resource_library (title, description, category, file_url, version, tags, access_level)
VALUES
    -- Templates
    ('RTO Policy Template', 'Comprehensive RTO policy template covering all regulatory requirements. Includes sections for governance, compliance, and operational procedures.', 'templates', NULL, 'v2.1', ARRAY['policy', 'compliance', 'governance'], 'member'),
    ('Training and Assessment Strategy Template', 'TAS template aligned with ASQA standards. Ready to customize for your scope of registration.', 'templates', NULL, 'v1.5', ARRAY['tas', 'training', 'assessment'], 'member'),
    ('Student Handbook Template', 'Modern student handbook template with all required information for VET students.', 'templates', NULL, 'v3.0', ARRAY['student', 'handbook', 'enrolment'], 'member'),
    
    -- Checklists
    ('ASQA Audit Preparation Checklist', 'Complete checklist to prepare for ASQA audits. Covers all standards and evidence requirements.', 'checklists', NULL, 'v2.0', ARRAY['asqa', 'audit', 'compliance'], 'member'),
    ('New Student Enrolment Checklist', 'Step-by-step checklist for processing new student enrolments correctly.', 'checklists', NULL, 'v1.2', ARRAY['enrolment', 'student', 'admin'], 'member'),
    ('Trainer Induction Checklist', 'Comprehensive checklist for onboarding new trainers and assessors.', 'checklists', NULL, 'v1.0', ARRAY['trainer', 'induction', 'hr'], 'member'),
    
    -- Registers & Forms
    ('Complaints & Appeals Register', 'Track and manage complaints and appeals with this comprehensive register template.', 'registers-forms', NULL, 'v1.8', ARRAY['complaints', 'appeals', 'register'], 'member'),
    ('Training Delivery Log', 'Log template for recording training delivery sessions and attendance.', 'registers-forms', NULL, 'v1.3', ARRAY['training', 'delivery', 'log'], 'member'),
    ('Assessment Validation Record', 'Form for documenting assessment validation activities and outcomes.', 'registers-forms', NULL, 'v2.0', ARRAY['assessment', 'validation', 'quality'], 'member'),
    
    -- Audit & Evidence Tools
    ('Evidence Collection Guide', 'Detailed guide on collecting and organizing evidence for compliance audits.', 'audit-evidence', NULL, 'v1.5', ARRAY['evidence', 'audit', 'guide'], 'member'),
    ('Self-Assessment Tool', 'Comprehensive self-assessment tool aligned with Standards for RTOs 2015.', 'audit-evidence', NULL, 'v2.2', ARRAY['self-assessment', 'standards', 'compliance'], 'member'),
    ('Internal Audit Procedure', 'Step-by-step procedure for conducting internal audits effectively.', 'audit-evidence', NULL, 'v1.1', ARRAY['internal-audit', 'procedure', 'quality'], 'member'),
    
    -- Training & Webinars
    ('ASQA Standards Deep Dive', 'Recorded webinar covering all clauses of the Standards for RTOs 2015 in detail.', 'training-webinars', NULL, 'v1.0', ARRAY['asqa', 'standards', 'webinar'], 'member'),
    ('Assessment Validation Masterclass', 'Expert training on conducting effective assessment validation sessions.', 'training-webinars', NULL, 'v1.2', ARRAY['validation', 'assessment', 'training'], 'member'),
    ('Compliance Calendar Management', 'Learn how to set up and manage your RTO compliance calendar effectively.', 'training-webinars', NULL, 'v1.0', ARRAY['compliance', 'calendar', 'management'], 'member'),
    
    -- Guides & How-To
    ('Getting Started with ComplyHub', 'Step-by-step guide to setting up and using ComplyHub for your RTO.', 'guides-howto', NULL, 'v3.0', ARRAY['complyhub', 'guide', 'getting-started'], 'member'),
    ('Understanding RTO Scope Changes', 'Complete guide to managing scope changes and additions for your RTO.', 'guides-howto', NULL, 'v1.5', ARRAY['scope', 'registration', 'guide'], 'member'),
    ('Best Practices for Online Delivery', 'Guide to transitioning training delivery to online and blended modes.', 'guides-howto', NULL, 'v2.0', ARRAY['online', 'delivery', 'best-practices'], 'member'),
    
    -- CI Tools
    ('Continuous Improvement Tracker', 'Tool for tracking and managing continuous improvement activities.', 'ci-tools', NULL, 'v1.4', ARRAY['ci', 'improvement', 'tracker'], 'member'),
    ('Industry Consultation Log', 'Template for recording industry consultation activities and feedback.', 'ci-tools', NULL, 'v1.1', ARRAY['industry', 'consultation', 'engagement'], 'member'),
    ('Feedback Analysis Template', 'Template for analyzing student and stakeholder feedback systematically.', 'ci-tools', NULL, 'v1.2', ARRAY['feedback', 'analysis', 'quality'], 'member');
