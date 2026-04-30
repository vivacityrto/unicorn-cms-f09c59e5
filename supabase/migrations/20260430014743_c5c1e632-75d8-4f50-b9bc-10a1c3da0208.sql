ALTER TABLE public.client_audits
  ADD COLUMN IF NOT EXISTS risk_rationale text;

COMMENT ON COLUMN public.client_audits.risk_rationale IS
  'Narrative justification for the auto-derived risk_rating. Drafted by AI via draft-executive-summary, accepted/edited by the auditor, persisted on accept.';