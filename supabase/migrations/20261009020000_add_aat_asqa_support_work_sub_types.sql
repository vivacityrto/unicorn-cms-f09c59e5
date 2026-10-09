-- Add "AAT Support" and "ASQA Support" to the Consultation work sub types
-- (Add Note / Add Time dialogs). Data-only; no schema, RLS or trigger change.
INSERT INTO public.dd_work_sub_type (code, label, category, sort_order, is_active)
VALUES
  ('aat_support', 'AAT Support', 'consultation', 11, true),
  ('asqa_support', 'ASQA Support', 'consultation', 12, true)
ON CONFLICT (code) DO NOTHING;
