INSERT INTO public.eos_issue_status_transitions (from_status, to_status) VALUES
  ('Open', 'Closed'),
  ('Discussing', 'Closed'),
  ('Actioning', 'Closed'),
  ('In Review', 'Closed')
ON CONFLICT DO NOTHING;