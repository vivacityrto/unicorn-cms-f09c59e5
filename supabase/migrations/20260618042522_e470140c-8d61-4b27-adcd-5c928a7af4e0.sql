ALTER TABLE public.compliance_obligations
  ADD COLUMN lead_times           integer[] NOT NULL DEFAULT ARRAY[30,14,7,1],
  ADD COLUMN notification_message text,
  ADD COLUMN due_date             date,
  ADD COLUMN audience_id          integer REFERENCES public.dd_obligation_audience(id),
  ADD COLUMN recurrence_id        integer REFERENCES public.dd_obligation_recurrence(id);