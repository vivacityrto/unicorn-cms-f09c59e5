SET search_path = public, pg_temp;

-- ===================================
-- SEED AUDIT QUESTION BANK
-- SRTOs 2025 Standards
-- ===================================

-- Quality Area 1: Training and Assessment (Standards 1.1-1.8)
INSERT INTO public.audit_question_bank (standard_code, quality_area, performance_indicator, question_text, evidence_prompt, risk_tags, version) VALUES
('1.1', 'QA1', 'Training is consistent with the requirements of the training product', 
 'Demonstrate how training aligns with performance criteria and assessment requirements',
 'TAS, mapping documents, session plans, delivery resources',
 ARRAY['training_integrity', 'student_progress'], 1),

('1.1', 'QA1', 'Training delivery matches approved training package requirements',
 'Show evidence that training content covers all units of competency',
 'Training materials, unit mapping, delivery schedules',
 ARRAY['training_integrity'], 1),

('1.2', 'QA1', 'Trainers and assessors meet required qualifications',
 'Provide evidence of trainer/assessor qualifications and industry currency',
 'Qualifications, professional development records, industry experience',
 ARRAY['credential_compliance', 'quality_training'], 1),

('1.3', 'QA1', 'Assessment meets requirements of the training package',
 'Demonstrate assessment tools are valid, reliable, fair, and flexible',
 'Assessment tools, validation records, moderation evidence',
 ARRAY['assessment_integrity', 'student_outcomes'], 1),

('1.4', 'QA1', 'Assessment is conducted by qualified assessors',
 'Show all assessors hold required qualifications and maintain competency',
 'Assessor qualifications, competency evidence, PD records',
 ARRAY['credential_compliance', 'assessment_integrity'], 1),

('1.5', 'QA1', 'Assessment decisions are valid, reliable, and fair',
 'Evidence assessment judgments are consistent and defensible',
 'Moderation records, validation evidence, appeal outcomes',
 ARRAY['assessment_integrity', 'student_harm'], 1),

('1.6', 'QA1', 'Assessment materials are appropriate and accessible',
 'Show assessment is fit for purpose and reasonable adjustments are made',
 'Assessment tools, LLN support evidence, adjustment records',
 ARRAY['student_access', 'equity'], 1),

('1.7', 'QA1', 'Systematic validation is conducted',
 'Provide evidence of validation schedule and implementation',
 'Validation plans, reports, corrective actions',
 ARRAY['quality_assurance', 'assessment_integrity'], 1),

('1.8', 'QA1', 'Assessment system integrity is maintained',
 'Demonstrate controls to prevent cheating, plagiarism, and collusion',
 'Integrity policies, detection processes, incident records',
 ARRAY['assessment_integrity', 'student_harm', 'registration_integrity'], 1);

-- Quality Area 2: Student Experience (Standards 2.1-2.8)
INSERT INTO public.audit_question_bank (standard_code, quality_area, performance_indicator, question_text, evidence_prompt, risk_tags, version) VALUES
('2.1', 'QA2', 'Students receive pre-enrollment information',
 'Show students receive accurate information before enrollment',
 'Marketing materials, pre-enrollment information, USI advice',
 ARRAY['student_information', 'consumer_protection'], 1),

('2.2', 'QA2', 'Students are properly informed and supported',
 'Demonstrate students understand their rights and have access to support',
 'Student handbook, support services, complaint records',
 ARRAY['student_support', 'consumer_protection'], 1),

('2.3', 'QA2', 'Welfare and guidance services are available',
 'Show appropriate support services are accessible to students',
 'Support service records, referral processes, student feedback',
 ARRAY['student_support', 'student_harm'], 1),

('2.4', 'QA2', 'Learning resources are appropriate and accessible',
 'Demonstrate learning resources meet student needs',
 'Learning materials, LMS access, resource adequacy evidence',
 ARRAY['student_support', 'training_quality'], 1),

('2.5', 'QA2', 'Complaints and appeals are handled appropriately',
 'Show effective complaints and appeals procedures',
 'Complaints register, resolution records, policy documents',
 ARRAY['consumer_protection', 'student_support'], 1);

-- Quality Area 3: Management Systems (Standards 3.1-3.3)
INSERT INTO public.audit_question_bank (standard_code, quality_area, performance_indicator, question_text, evidence_prompt, risk_tags, version) VALUES
('3.1', 'QA3', 'Governance and administration systems are effective',
 'Demonstrate effective governance structures and administrative processes',
 'Governance documents, policies, administrative records',
 ARRAY['governance', 'compliance_systems'], 1),

('3.2', 'QA3', 'Student records are accurate and secure',
 'Show student records are maintained securely and accurately',
 'Record management system, security measures, accuracy checks',
 ARRAY['data_security', 'student_records', 'registration_integrity'], 1),

('3.3', 'QA3', 'Continuous improvement processes are in place',
 'Evidence of systematic review and improvement activities',
 'CI plans, review records, improvement actions',
 ARRAY['quality_assurance', 'continuous_improvement'], 1);

-- Quality Area 4: Financial Viability
INSERT INTO public.audit_question_bank (standard_code, quality_area, performance_indicator, question_text, evidence_prompt, risk_tags, version) VALUES
('4.1', 'QA4', 'Financial management is sound',
 'Demonstrate financial viability and appropriate financial controls',
 'Financial statements, budgets, audit reports',
 ARRAY['financial_viability', 'governance'], 1);

-- Quality Area 5: Marketing and Recruitment
INSERT INTO public.audit_question_bank (standard_code, quality_area, performance_indicator, question_text, evidence_prompt, risk_tags, version) VALUES
('5.1', 'QA5', 'Marketing information is accurate',
 'Show marketing materials are truthful and not misleading',
 'Marketing materials, website content, advertising',
 ARRAY['consumer_protection', 'student_information'], 1);

-- Quality Area 6: Third Party Arrangements
INSERT INTO public.audit_question_bank (standard_code, quality_area, performance_indicator, question_text, evidence_prompt, risk_tags, version) VALUES
('6.1', 'QA6', 'Third party arrangements are properly managed',
 'Demonstrate oversight of third party delivery',
 'Partnership agreements, monitoring records, quality assurance evidence',
 ARRAY['third_party_risk', 'quality_assurance'], 1);

-- Quality Area 7: Transitions and Pathways
INSERT INTO public.audit_question_bank (standard_code, quality_area, performance_indicator, question_text, evidence_prompt, risk_tags, version) VALUES
('7.1', 'QA7', 'Pathways and credit transfer are appropriate',
 'Show effective pathway and credit arrangements',
 'Credit policies, articulation agreements, pathway evidence',
 ARRAY['student_pathways', 'compliance'], 1);

-- Quality Area 8: Regulatory Compliance
INSERT INTO public.audit_question_bank (standard_code, quality_area, performance_indicator, question_text, evidence_prompt, risk_tags, version) VALUES
('8.1', 'QA8', 'Regulatory requirements are met',
 'Demonstrate compliance with all regulatory obligations',
 'Compliance register, audit reports, rectification evidence',
 ARRAY['regulatory_compliance', 'registration_integrity'], 1);
