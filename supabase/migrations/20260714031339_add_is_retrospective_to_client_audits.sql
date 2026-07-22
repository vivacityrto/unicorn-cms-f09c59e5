-- A5 (Unicorn 2.0 Feature Status report, §4): distinguish audits recorded
-- after the fact from the normal New Audit -> schedule -> conduct flow, so
-- staff stop misusing the scheduler for retrospective records.
ALTER TABLE public.client_audits
  ADD COLUMN is_retrospective boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.client_audits.is_retrospective IS
  'True when the audit was logged via "Record completed audit" (A5) rather than the New Audit -> schedule -> conduct flow. Distinguishes after-the-fact records from live-scheduled audits.';