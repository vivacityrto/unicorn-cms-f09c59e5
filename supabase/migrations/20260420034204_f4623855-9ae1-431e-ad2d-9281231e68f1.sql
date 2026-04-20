INSERT INTO public.dd_work_sub_type (code, label, category, sort_order, is_active)
VALUES
  ('governance_meeting_mt', 'Governance Meeting', 'meeting', 1, true),
  ('general_meeting', 'General Meeting', 'meeting', 2, true),
  ('regulatory_support_meeting', 'Regulatory Support Meeting', 'meeting', 3, true),
  ('compliance_health_check_mt', 'Compliance Health Check', 'meeting', 4, true),
  ('asqa_audit_meeting', 'ASQA Audit/Meeting', 'meeting', 5, true)
ON CONFLICT (code) DO NOTHING;